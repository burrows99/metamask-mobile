import {
  TestWrapper,
  buildOrderContextMock,
  defaultMockHooks,
  mockCreateEventBuilder,
  mockNavigate,
  mockUseIsPerpsBalanceSelected,
  setMockIsPayQuoteLoading,
  setMockIsPaySubmitReady,
  setMockLeverageConfirmValue,
  setMockPayRequiredTokens,
  setMockSliderDragValue,
  setupPerpsOrderViewMocks,
} from './PerpsOrderView.testUtils';
import { useRoute } from '@react-navigation/native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { PerpsOrderViewSelectorsIDs } from '../../Perps.testIds';
import {
  usePerpsLiveAccount,
  usePerpsLiquidationPrice,
  usePerpsNetwork,
  usePerpsOrderExecution,
  usePerpsOrderForm,
  usePerpsOrderValidation,
  usePerpsTrading,
  usePerpsToasts,
} from '../../hooks';
import { usePerpsOrderContext } from '../../contexts/PerpsOrderContext';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '@metamask/perps-controller';
import { PERPS_ANALYTICS_PREVIOUS_LEVERAGE } from '../../constants/perpsAnalytics';
import PerpsOrderView from './PerpsOrderView';

describe('PerpsOrderView', () => {
  beforeEach(() => {
    setupPerpsOrderViewMocks();
  });

  describe('Slider drag commit funnel', () => {
    it('shows the live drag value instead of the stale committed amount while dragging', () => {
      setMockSliderDragValue(42);
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));

      expect(screen.getByText('Slider Value: 42')).toBeOnTheScreen();
    });

    it('commits the live value on drag end', () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({ setAmount: mockSetAmount }),
      );
      setMockSliderDragValue(77);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));
      fireEvent.press(screen.getByTestId('perps-slider-drag-end'));

      expect(mockSetAmount).toHaveBeenCalledWith('77');
    });

    it('flushes the live drag value forward on cancel instead of discarding it', () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({ setAmount: mockSetAmount }),
      );
      setMockSliderDragValue(88);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));
      // A gesture cancelled by competing-gesture arbitration never fires
      // onDragEnd; only the wrapping View's onTouchCancel signals it.
      fireEvent(
        screen.getByTestId('perps-slider').parent as ReactTestInstance,
        'touchCancel',
      );

      expect(mockSetAmount).toHaveBeenCalledWith('88');
    });

    it('does not commit anything on cancel when the slider was never dragged', () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({ setAmount: mockSetAmount }),
      );

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent(
        screen.getByTestId('perps-slider').parent as ReactTestInstance,
        'touchCancel',
      );

      expect(mockSetAmount).not.toHaveBeenCalled();
    });

    it('flushes a stuck live drag value instead of submitting a stale order', async () => {
      const mockSetAmount = jest.fn();
      const mockExecuteOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({ setAmount: mockSetAmount }),
      );
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: mockExecuteOrder,
        isPlacing: false,
      });
      setMockSliderDragValue(55);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      await act(async () => {
        fireEvent.press(placeOrderButton);
      });

      // The stuck live value is flushed forward, not submitted directly -
      // this same tap only flushes and bails, it does not place the order.
      expect(mockSetAmount).toHaveBeenCalledWith('55');
      expect(mockExecuteOrder).not.toHaveBeenCalled();
    });
  });

  describe('Keypad Done clamp', () => {
    it('clamps against the current max, not the max captured at mount', () => {
      // The view is wrapped in React.memo; the clamp must read the latest
      // maxPossibleAmount instead of a mount-time closure (max = 0 before the
      // account loads), which used to reset the typed amount to 0 on Done.
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({
          setAmount: mockSetAmount,
          maxPossibleAmount: 0,
        }),
      );
      const { rerender } = render(<PerpsOrderView />, {
        wrapper: TestWrapper,
      });

      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({
          setAmount: mockSetAmount,
          maxPossibleAmount: 1000,
        }),
      );
      rerender(<PerpsOrderView />);

      fireEvent.press(screen.getByTestId('perps-amount-display'));
      fireEvent.press(screen.getByTestId('keypad-key-1'));
      fireEvent.press(
        screen.getByTestId(PerpsOrderViewSelectorsIDs.KEYPAD_DONE),
      );

      expect(mockSetAmount).not.toHaveBeenCalledWith('0');
    });

    it('still clamps a typed amount above the current max on Done', () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({
          setAmount: mockSetAmount,
          // orderForm.amount defaults to '11', above this max.
          maxPossibleAmount: 5,
        }),
      );
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-amount-display'));
      fireEvent.press(screen.getByTestId('keypad-key-1'));
      fireEvent.press(
        screen.getByTestId(PerpsOrderViewSelectorsIDs.KEYPAD_DONE),
      );

      expect(mockSetAmount).toHaveBeenLastCalledWith('5');
    });
  });

  describe('Leverage confirm resolves against the live drag amount', () => {
    it('flushes the live drag amount forward when no clamping is required', async () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({
          setAmount: mockSetAmount,
          balanceForValidation: 1000,
        }),
      );
      setMockSliderDragValue(50);
      setMockLeverageConfirmValue(3);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));

      const leverageRow = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.LEVERAGE_ROW,
      );
      await act(async () => {
        fireEvent.press(leverageRow);
      });
      const confirmButton = await screen.findByTestId('leverage-bottom-sheet');
      await act(async () => {
        fireEvent.press(confirmButton);
      });

      expect(mockSetAmount).toHaveBeenCalledWith('50');
    });

    it('clamps against the live drag amount, not the stale committed amount', async () => {
      const mockSetAmount = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        buildOrderContextMock({
          setAmount: mockSetAmount,
          // orderForm.amount stays '11' (well under the new max); only the
          // live drag value should be able to trigger the clamp below.
          balanceForValidation: 1000,
        }),
      );
      setMockSliderDragValue(5000); // exceeds the post-confirm max of 1000
      setMockLeverageConfirmValue(1);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      fireEvent.press(screen.getByTestId('perps-slider-drag'));

      const leverageRow = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.LEVERAGE_ROW,
      );
      await act(async () => {
        fireEvent.press(leverageRow);
      });
      const confirmButton = await screen.findByTestId('leverage-bottom-sheet');
      await act(async () => {
        fireEvent.press(confirmButton);
      });

      // newMaxAmount = balanceForValidation(1000) * leverage(1) = 1000. Using
      // the stale orderForm.amount ('11') for the check would never have
      // triggered this clamp at all.
      expect(mockSetAmount).toHaveBeenCalledWith('1000');
    });

    it('tracks leverage change with previous_leverage and not previousLeverage', async () => {
      const captured: { eventName: unknown; props: Record<string, unknown> }[] =
        [];
      mockCreateEventBuilder.mockImplementation((eventName?: unknown) => {
        const builder: { addProperties: jest.Mock; build: jest.Mock } = {
          addProperties: jest.fn((props: Record<string, unknown>) => {
            captured.push({ eventName, props });
            return builder;
          }),
          build: jest.fn(() => ({})),
        };
        return builder;
      });
      setMockLeverageConfirmValue(10);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const leverageRow = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.LEVERAGE_ROW,
      );
      await act(async () => {
        fireEvent.press(leverageRow);
      });
      const confirmButton = await screen.findByTestId('leverage-bottom-sheet');
      await act(async () => {
        fireEvent.press(confirmButton);
      });

      const leverageChange = captured.find(
        (event) =>
          event.eventName === MetaMetricsEvents.PERPS_UI_INTERACTION &&
          event.props?.[PERPS_EVENT_PROPERTY.INTERACTION_TYPE] ===
            PERPS_EVENT_VALUE.INTERACTION_TYPE.LEVERAGE_CHANGED,
      );
      expect(leverageChange?.props).toEqual(
        expect.objectContaining({
          [PERPS_ANALYTICS_PREVIOUS_LEVERAGE]: 3,
          [PERPS_EVENT_PROPERTY.LEVERAGE_USED]: 10,
        }),
      );
      expect(leverageChange?.props).not.toHaveProperty('previousLeverage');
    });
  });

  it('handles testnet defaults', async () => {
    (usePerpsNetwork as jest.Mock).mockReturnValue('testnet');

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Should use testnet defaults
    await waitFor(() => {
      expect(screen.getByTestId('perps-amount-display')).toBeDefined();
    });
  });

  it('opens limit price bottom sheet from limit price row', async () => {
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
      },
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    fireEvent.press(
      await screen.findByTestId(PerpsOrderViewSelectorsIDs.LIMIT_PRICE_ROW),
    );

    expect(screen.getByTestId('limit-price-bottom-sheet')).toBeOnTheScreen();
  });

  it('handles short direction from route params', async () => {
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'BTC',
        direction: 'short',
      },
    });

    // Override the default mock for this specific test
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      orderForm: {
        asset: 'BTC',
        amount: '11',
        leverage: 3,
        direction: 'short',
        type: 'market',
        limitPrice: undefined,
        takeProfitPrice: undefined,
        stopLossPrice: undefined,
        balancePercent: 10,
      },
      setAmount: jest.fn(),
      setLeverage: jest.fn(),
      setTakeProfitPrice: jest.fn(),
      setStopLossPrice: jest.fn(),
      setLimitPrice: jest.fn(),
      setOrderType: jest.fn(),
      updateOrderForm: jest.fn(),
      handlePercentageAmount: jest.fn(),
      handleMaxAmount: jest.fn(),
      handleMinAmount: jest.fn(),
      optimizeOrderAmount: jest.fn(),
      maxPossibleAmount: 1000,
      setEstimatedFeeRate: jest.fn(),
      balanceForValidation: 1000,
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Find all elements with 'Short BTC' text (header and button)
    const shortBTCElements = await screen.findAllByText('Short BTC');
    // There should be at least one element (could be in header and/or button)
    expect(shortBTCElements.length).toBeGreaterThanOrEqual(1);
  });

  it('handles custom leverage from route params', async () => {
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'SOL',
        leverage: 10,
      },
    });

    // Override the context mock to show the correct leverage
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      orderForm: {
        asset: 'SOL',
        amount: '11',
        leverage: 10,
        direction: 'long',
        type: 'market',
        limitPrice: undefined,
        takeProfitPrice: undefined,
        stopLossPrice: undefined,
        balancePercent: 10,
      },
      setAmount: jest.fn(),
      setLeverage: jest.fn(),
      setTakeProfitPrice: jest.fn(),
      setStopLossPrice: jest.fn(),
      setLimitPrice: jest.fn(),
      setOrderType: jest.fn(),
      updateOrderForm: jest.fn(),
      handlePercentageAmount: jest.fn(),
      handleMaxAmount: jest.fn(),
      handleMinAmount: jest.fn(),
      optimizeOrderAmount: jest.fn(),
      maxPossibleAmount: 1000,
      setEstimatedFeeRate: jest.fn(),
      balanceForValidation: 1000,
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText('10x')).toBeDefined();
    });
  });

  it('calculates liquidation price', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText('Liquidation price')).toBeDefined();
    });
  });

  it('calculates liquidation price using market price for market orders', async () => {
    // Set route params for market order
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'BTC',
        direction: 'long',
        amount: '100',
        leverage: 10,
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Wait for component to render and liquidation price to be calculated
    await waitFor(() => {
      expect(screen.getByText('Liquidation price')).toBeDefined();
    });

    // Since the default order type is 'market' and no limit price is set,
    // the hook should be called with the current market price (3000 from mock data)
    expect(usePerpsLiquidationPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPrice: 3000, // Current mock price from assetData
      }),
    );
  });

  it('calculates liquidation price using limit price for limit orders', async () => {
    // We need to test the logic by examining what happens when the order context
    // provides limit order data. Since the actual context logic is complex,
    // we'll verify the memoized calculation logic instead.
    // Set route params that would lead to a limit order
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'BTC',
        direction: 'long',
        amount: '100',
        leverage: 10,
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Liquidation price')).toBeDefined();
    });

    // The liquidation price hook should be called - the exact parameters
    // depend on the order form state. We verify it's being called which
    // confirms our logic is reached.
    expect(usePerpsLiquidationPrice).toHaveBeenCalled();
  });

  it('shows margin required', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText('Margin')).toBeDefined();
    });
  });

  it('shows position size', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Position size is displayed in the order details
    expect(screen.getByTestId('perps-order-header')).toBeDefined();
  });

  it('should show estimated fees', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText('Fees')).toBeDefined();
    });
  });

  it('handles zero balance warning', async () => {
    (usePerpsLiveAccount as jest.Mock).mockReturnValue({
      balance: '0',
      spendableBalance: '0',
      withdrawableBalance: '0',
      accountInfo: {
        marginSummary: {
          accountValue: 0,
          totalMarginUsed: 0,
        },
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Should show warning when balance is zero
    await waitFor(() => {
      expect(screen.getByTestId('perps-amount-display')).toBeDefined();
    });
  });

  it('validates order before placement', async () => {
    // Mock insufficient balance
    (usePerpsLiveAccount as jest.Mock).mockReturnValue({
      balance: '10',
      spendableBalance: '10',
      withdrawableBalance: '10',
      accountInfo: {
        marginSummary: {
          accountValue: 10,
          totalMarginUsed: 0,
        },
      },
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );
    await act(async () => {
      fireEvent.press(placeOrderButton);
    });

    // Should not call placeOrder due to validation failure
    await waitFor(() => {
      expect(
        defaultMockHooks.usePerpsTrading.placeOrder,
      ).not.toHaveBeenCalled();
    });
  });

  it('handles network error during order placement', () => {
    const mockPlaceOrder = jest
      .fn()
      .mockRejectedValue(new Error('Network error'));

    (usePerpsTrading as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsTrading,
      placeOrder: mockPlaceOrder,
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Verify the component renders with our mock
    expect(mockPlaceOrder).toBeDefined();
  });

  it('shows PerpsBottomSheetTooltip when info icon is clicked', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Find and click the leverage info icon using its testID
    const leverageInfoIcon = screen.getByTestId(
      PerpsOrderViewSelectorsIDs.LEVERAGE_INFO_ICON,
    );
    expect(leverageInfoIcon).toBeDefined();

    fireEvent.press(leverageInfoIcon);

    // The tooltip should become visible
    await waitFor(() => {
      expect(
        screen.getByTestId('perps-order-view-bottom-sheet-tooltip'),
      ).toBeDefined();
    });
  });

  describe('Place order button disabled state', () => {
    it('disables button when order validation is invalid', async () => {
      // Mock invalid order validation
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['Insufficient balance'],
        fieldIssues: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });

      // Ensure order execution is not placing
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Button should render with test ID
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDisabled();

      // Verify validation errors are shown (indicating disabled state)
      // Wait for error to appear after isDataReady becomes true
      const errorText = await screen.findByText('Insufficient balance');
      expect(errorText).toBeDefined();
    });

    it('disables button when order is placing', async () => {
      // Mock placing order state
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: true,
      });

      // Mock valid order validation
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        fieldIssues: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // When placing order, button shows loading indicator
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDisabled();
      expect(placeOrderButton.props.accessibilityState?.busy).toBe(true);
    });

    it('validates a pending order on tap without changing CTA presentation', async () => {
      // Arrange
      let resolveValidation:
        | ((attempt: {
            isValid: boolean;
            errors: string[];
            warnings: string[];
            fieldIssues: never[];
          }) => void)
        | undefined;
      const pendingValidation = new Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        fieldIssues: never[];
      }>((resolve) => {
        resolveValidation = resolve;
      });
      const validateNow = jest.fn().mockReturnValue(pendingValidation);
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        fieldIssues: [],
        isValidating: true,
        insufficientBalanceErrors: [],
        validateNow,
      });

      const mockPlaceOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: mockPlaceOrder,
        isPlacing: false,
      });

      // Act
      const { rerender } = render(<PerpsOrderView />, {
        wrapper: TestWrapper,
      });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      // Assert
      expect(placeOrderButton).toBeOnTheScreen();
      expect(placeOrderButton).toBeEnabled();
      expect(placeOrderButton.props.accessibilityState?.busy).not.toBe(true);
      await act(async () => {
        fireEvent.press(placeOrderButton);
        fireEvent.press(placeOrderButton);
        resolveValidation?.({
          isValid: true,
          errors: [],
          warnings: [],
          fieldIssues: [],
        });
        await pendingValidation;
      });
      expect(validateNow).toHaveBeenCalledTimes(1);
      expect(mockPlaceOrder).toHaveBeenCalledTimes(1);

      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        fieldIssues: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
      rerender(<PerpsOrderView />);

      expect(placeOrderButton).toBeEnabled();
    });

    it('disables when synchronous field validation reports an issue', async () => {
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [],
        fieldIssues: [{ field: 'limitPrice', issue: { code: 'required' } }],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDisabled();
    });

    it('enables button when validation passes and not placing order', async () => {
      // Mock valid order state
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        fieldIssues: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });

      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDefined();
      expect(placeOrderButton).toBeEnabled();
    });
  });

  describe('pay amount readiness', () => {
    beforeEach(() => {
      setMockIsPayQuoteLoading(false);
      setMockPayRequiredTokens([]);
      setMockIsPaySubmitReady(true);
      // A custom pay token, not the Perps balance: the gate only applies here.
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });
    });

    afterEach(() => {
      setMockPayRequiredTokens([]);
      setMockIsPaySubmitReady(true);
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
    });

    it('disables place order while the required token amount is still zero', async () => {
      // The pay controller has not received the deposit amount yet, and no
      // quote request has started, so nothing else would block the button.
      setMockPayRequiredTokens([{ amountRaw: '0', skipIfBalance: false }]);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDisabled();
    });

    it('enables place order once the required token amount arrives', async () => {
      setMockPayRequiredTokens([
        { amountRaw: '3430000', skipIfBalance: false },
      ]);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeEnabled();
    });

    it('ignores a zero amount on a token that is skipped when the balance covers it', async () => {
      setMockPayRequiredTokens([{ amountRaw: '0', skipIfBalance: true }]);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeEnabled();
    });

    it('leaves place order enabled when paying from the Perps balance', async () => {
      // Orders funded from the Perps balance never deposit, so a stale pay
      // amount must not block them.
      mockUseIsPerpsBalanceSelected.mockReturnValue(true);
      setMockPayRequiredTokens([{ amountRaw: '0', skipIfBalance: false }]);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeEnabled();
    });

    it('disables place order while the pay state would fail the publish guard', async () => {
      // The amount landed and nothing reports as loading, but there is no
      // executable quote and no validated direct route (e.g. the quote fetch
      // failed or never started, or the payment token was never set). A tap
      // here would be rejected at publish with "Cannot submit without quote".
      setMockPayRequiredTokens([
        { amountRaw: '3430000', skipIfBalance: false },
      ]);
      setMockIsPaySubmitReady(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeDisabled();
    });

    it('leaves place order enabled when paying from the Perps balance while pay state is not submit ready', async () => {
      // Orders funded from the Perps balance never deposit, so pay submit
      // readiness must not block them.
      mockUseIsPerpsBalanceSelected.mockReturnValue(true);
      setMockPayRequiredTokens([
        { amountRaw: '3430000', skipIfBalance: false },
      ]);
      setMockIsPaySubmitReady(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton).toBeEnabled();
    });
  });

  describe('Stop loss liquidation warning', () => {
    it('shows liquidation warning for long position with stop loss below liquidation price', async () => {
      // Mock order context with risky stop loss for long position
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: '2800', // Stop loss below liquidation price (risky)
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price higher than stop loss
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '2850.00', // Higher than stop loss (2800)
        isCalculating: false,
        error: null,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render - calculate expected RoE:
      // Long SL at 2800 vs current price 3000: (3000-2800)/3000 * 10 * 100 = 67%
      await waitFor(() => {
        expect(screen.getByText('TP off, SL 67%')).toBeDefined();
      });

      // Verify the warning message is displayed
      expect(
        screen.getByText('Stop loss is below liquidation price'),
      ).toBeDefined();
    });

    it('shows liquidation warning for short position with stop loss above liquidation price', async () => {
      // Mock order context with risky stop loss for short position
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'short',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: '3200', // Stop loss above liquidation price (risky for short)
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price lower than stop loss
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '3150.00', // Lower than stop loss (3200)
        isCalculating: false,
        error: null,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render - calculate expected RoE:
      // Short SL at 3200 vs current price 3000: (3200-3000)/3000 * 10 * 100 = 67%
      await waitFor(() => {
        expect(screen.getByText('TP off, SL 67%')).toBeDefined();
      });

      // Verify the warning message is displayed with "above" for short positions
      expect(
        screen.getByText('Stop loss is above liquidation price'),
      ).toBeDefined();
    });

    it('does not show liquidation warning when stop loss is safe for long position', async () => {
      // Mock order context with safe stop loss for long position
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: '2900', // Stop loss above liquidation price (safe)
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price lower than stop loss
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '2850.00', // Lower than stop loss (2900)
        isCalculating: false,
        error: null,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render - calculate expected RoE:
      // Long SL at 2900 vs current price 3000: (3000-2900)/3000 * 10 * 100 = 33%
      await waitFor(() => {
        expect(screen.getByText('TP off, SL 33%')).toBeDefined();
      });

      // Verify the warning message is NOT displayed
      expect(
        screen.queryByText('Stop loss is below liquidation price'),
      ).toBeNull();
      expect(
        screen.queryByText('Stop loss is above liquidation price'),
      ).toBeNull();
    });

    it('does not show liquidation warning when stop loss is safe for short position', async () => {
      // Mock order context with safe stop loss for short position
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'short',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: '3100', // Stop loss below liquidation price (safe for short)
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price higher than stop loss
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '3150.00', // Higher than stop loss (3100)
        isCalculating: false,
        error: null,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render - calculate expected RoE:
      // Short SL at 3100 vs current price 3000: (3100-3000)/3000 * 10 * 100 = 33%
      await waitFor(() => {
        expect(screen.getByText('TP off, SL 33%')).toBeDefined();
      });

      // Verify the warning message is NOT displayed
      expect(
        screen.queryByText('Stop loss is below liquidation price'),
      ).toBeNull();
      expect(
        screen.queryByText('Stop loss is above liquidation price'),
      ).toBeNull();
    });

    it('does not show liquidation warning when no stop loss is set', async () => {
      // Mock order context without stop loss
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined, // No stop loss set
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '2850.00',
        isCalculating: false,
        error: null,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByText('TP off, SL off')).toBeDefined();
      });

      // Verify the warning message is NOT displayed
      expect(
        screen.queryByText('Stop loss is below liquidation price'),
      ).toBeNull();
      expect(
        screen.queryByText('Stop loss is above liquidation price'),
      ).toBeNull();
    });

    it('disables place order button when stop loss risks liquidation', async () => {
      // Mock order context with risky stop loss
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: '2800', // Risky stop loss
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.033',
        },
      });

      // Mock liquidation price higher than stop loss
      (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
        liquidationPrice: '2850.00',
        isCalculating: false,
        error: null,
      });

      // Mock valid order validation (other validations pass)
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });

      // Mock order execution not placing
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to render
      await waitFor(() => {
        expect(
          screen.getByText('Stop loss is below liquidation price'),
        ).toBeDefined();
      });

      // Find the place order button
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );

      // Verify the button is disabled due to liquidation risk
      expect(placeOrderButton).toBeDisabled();
    });
  });

  describe('TP/SL wrong-side price validation', () => {
    const orderContextWithTPSL = (overrides: {
      direction: 'long' | 'short';
      takeProfitPrice?: string;
      stopLossPrice?: string;
    }) => ({
      orderForm: {
        asset: 'ETH',
        amount: '100',
        leverage: 10,
        direction: overrides.direction,
        type: 'market' as const,
        limitPrice: undefined,
        takeProfitPrice: overrides.takeProfitPrice,
        stopLossPrice: overrides.stopLossPrice,
        balancePercent: 10,
      },
      setAmount: jest.fn(),
      setLeverage: jest.fn(),
      setTakeProfitPrice: jest.fn(),
      setStopLossPrice: jest.fn(),
      setLimitPrice: jest.fn(),
      setOrderType: jest.fn(),
      updateOrderForm: jest.fn(),
      handlePercentageAmount: jest.fn(),
      handleMaxAmount: jest.fn(),
      handleMinAmount: jest.fn(),
      optimizeOrderAmount: jest.fn(),
      maxPossibleAmount: 1000,
      setEstimatedFeeRate: jest.fn(),
      balanceForValidation: 1000,
      calculations: {
        marginRequired: '10',
        positionSize: '0.033',
      },
    });

    it('shows warning and disables button for long position with TP below current price', async () => {
      // Arrange: TP at 2000 is below current price 3000 → invalid for long
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({ direction: 'long', takeProfitPrice: '2000' }),
      );
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: warning visible
      await waitFor(() => {
        expect(
          screen.getByText(
            'Take profit must be above current price. Update or clear it to place the order.',
          ),
        ).toBeDefined();
      });

      // Assert: button disabled
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton.props.accessibilityState?.disabled).toBeTruthy();
    });

    it('shows warning and disables button for long position with SL above current price', async () => {
      // Arrange: SL at 3500 is above current price 3000 → invalid for long
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({ direction: 'long', stopLossPrice: '3500' }),
      );
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: warning visible
      await waitFor(() => {
        expect(
          screen.getByText(
            'Stop loss must be below current price. Update or clear it to place the order.',
          ),
        ).toBeDefined();
      });

      // Assert: button disabled
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton.props.accessibilityState?.disabled).toBeTruthy();
    });

    it('shows warning for short position with TP above current price', async () => {
      // Arrange: TP at 3500 is above current price 3000 → invalid for short
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({ direction: 'short', takeProfitPrice: '3500' }),
      );

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: warning uses "below" for short
      await waitFor(() => {
        expect(
          screen.getByText(
            'Take profit must be below current price. Update or clear it to place the order.',
          ),
        ).toBeDefined();
      });
    });

    it('shows warning for short position with SL below current price', async () => {
      // Arrange: SL at 2000 is below current price 3000 → invalid for short
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({ direction: 'short', stopLossPrice: '2000' }),
      );

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: warning uses "above" for short
      await waitFor(() => {
        expect(
          screen.getByText(
            'Stop loss must be above current price. Update or clear it to place the order.',
          ),
        ).toBeDefined();
      });
    });

    it('does not show wrong-side warnings when TP/SL prices are valid', async () => {
      // Arrange: valid TP above and SL below current price for long
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({
          direction: 'long',
          takeProfitPrice: '3500',
          stopLossPrice: '2500',
        }),
      );

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: component renders (TP/SL summary with valid percentages)
      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeDefined();
      });

      // Assert: no wrong-side warnings
      expect(screen.queryByText(/Take profit must be/)).toBeNull();
      expect(screen.queryByText(/Stop loss must be.*current price/)).toBeNull();
    });

    it('disables button when both TP and SL are on wrong side', async () => {
      // Arrange: both invalid for long (TP below, SL above current price)
      (usePerpsOrderContext as jest.Mock).mockReturnValue(
        orderContextWithTPSL({
          direction: 'long',
          takeProfitPrice: '2000',
          stopLossPrice: '3500',
        }),
      );
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn(),
        isPlacing: false,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert: both warnings shown
      await waitFor(() => {
        expect(screen.getByText(/Take profit must be above/)).toBeDefined();
        expect(screen.getByText(/Stop loss must be below/)).toBeDefined();
      });

      // Assert: button disabled
      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      expect(placeOrderButton.props.accessibilityState?.disabled).toBeTruthy();
    });

    describe('limit order TP/SL validates against entry price, not market price', () => {
      const orderContextForLimitOrder = (overrides: {
        direction: 'long' | 'short';
        limitPrice: string;
        takeProfitPrice?: string;
        stopLossPrice?: string;
      }) => ({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 10,
          direction: overrides.direction,
          type: 'limit' as const,
          limitPrice: overrides.limitPrice,
          takeProfitPrice: overrides.takeProfitPrice,
          stopLossPrice: overrides.stopLossPrice,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '10',
          positionSize: '0.04',
        },
      });

      it('accepts TP above limit price for long limit order even when TP is below market price', async () => {
        // Scenario: market at $3000, long limit buy at $2500, TP at $2700
        // TP $2700 is valid relative to $2500 entry but below $3000 market price
        (usePerpsOrderContext as jest.Mock).mockReturnValue(
          orderContextForLimitOrder({
            direction: 'long',
            limitPrice: '2500',
            takeProfitPrice: '2700',
          }),
        );
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          isValidating: false,
          insufficientBalanceErrors: [],
          validateNow: jest.fn(),
        });
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: jest.fn(),
          isPlacing: false,
        });

        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await waitFor(() => {
          expect(screen.getByText('Leverage')).toBeDefined();
        });

        // TP at $2700 is above the $2500 limit (entry) price, so no warning should appear
        expect(screen.queryByText(/Take profit must be/)).toBeNull();
      });

      it('accepts SL below limit price for long limit order even when SL is below market price', async () => {
        // Scenario: market at $3000, long limit buy at $2500, SL at $2300
        // SL $2300 is valid relative to $2500 entry
        (usePerpsOrderContext as jest.Mock).mockReturnValue(
          orderContextForLimitOrder({
            direction: 'long',
            limitPrice: '2500',
            stopLossPrice: '2300',
          }),
        );
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          isValidating: false,
          insufficientBalanceErrors: [],
          validateNow: jest.fn(),
        });
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: jest.fn(),
          isPlacing: false,
        });

        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await waitFor(() => {
          expect(screen.getByText('Leverage')).toBeDefined();
        });

        // SL at $2300 is below the $2500 limit (entry) price, so no warning should appear
        expect(screen.queryByText(/Stop loss must be/)).toBeNull();
      });

      it('rejects TP below limit price for long limit order', async () => {
        // Scenario: market at $3000, long limit buy at $2500, TP at $2400
        // TP $2400 is below the $2500 entry → invalid
        (usePerpsOrderContext as jest.Mock).mockReturnValue(
          orderContextForLimitOrder({
            direction: 'long',
            limitPrice: '2500',
            takeProfitPrice: '2400',
          }),
        );
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          isValidating: false,
          insufficientBalanceErrors: [],
          validateNow: jest.fn(),
        });
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: jest.fn(),
          isPlacing: false,
        });

        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await waitFor(() => {
          expect(
            screen.getByText(/Take profit must be above entry price/),
          ).toBeDefined();
        });
      });

      it('accepts TP below limit price for short limit order even when TP is above market price', async () => {
        // Scenario: market at $3000, short limit sell at $3500, TP at $3200
        // TP $3200 is below $3500 entry (valid for short) but above $3000 market
        (usePerpsOrderContext as jest.Mock).mockReturnValue(
          orderContextForLimitOrder({
            direction: 'short',
            limitPrice: '3500',
            takeProfitPrice: '3200',
          }),
        );
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          isValidating: false,
          insufficientBalanceErrors: [],
          validateNow: jest.fn(),
        });
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: jest.fn(),
          isPlacing: false,
        });

        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await waitFor(() => {
          expect(screen.getByText('Leverage')).toBeDefined();
        });

        // TP at $3200 is below $3500 limit entry, valid for short
        expect(screen.queryByText(/Take profit must be/)).toBeNull();
      });

      it('accepts SL above limit price for short limit order', async () => {
        // Scenario: market at $3000, short limit sell at $3500, SL at $3700
        // SL $3700 is above $3500 entry (valid for short)
        (usePerpsOrderContext as jest.Mock).mockReturnValue(
          orderContextForLimitOrder({
            direction: 'short',
            limitPrice: '3500',
            stopLossPrice: '3700',
          }),
        );
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          isValidating: false,
          insufficientBalanceErrors: [],
          validateNow: jest.fn(),
        });
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: jest.fn(),
          isPlacing: false,
        });

        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await waitFor(() => {
          expect(screen.getByText('Leverage')).toBeDefined();
        });

        // SL at $3700 is above $3500 limit entry, valid for short
        expect(screen.queryByText(/Stop loss must be/)).toBeNull();
      });
    });
  });

  describe('TP/SL limit price validation', () => {
    it('shows toast and prevents TP/SL bottom sheet from opening on limit order without limit price', async () => {
      // Clear all mocks to ensure clean state
      jest.clearAllMocks();

      // Create a mock showToast function that we can spy on
      const mockShowToast = jest.fn();
      const mockLimitPriceRequiredToast =
        'mock-limit-price-required-toast-object';

      // Mock the context to provide order form data
      (usePerpsOrderContext as jest.Mock).mockImplementation(() => ({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 3,
          direction: 'long',
          type: 'limit', // This is a limit order
          limitPrice: undefined, // But no limit price is set
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '33.33',
          positionSize: '0.0333',
        },
      }));

      // Mock usePerpsOrderForm to match the context
      (usePerpsOrderForm as jest.Mock).mockImplementation(() => ({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 3,
          direction: 'long',
          type: 'limit',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '33.33',
          positionSize: '0.0333',
        },
      }));

      // Mock the usePerpsToasts hook
      (usePerpsToasts as jest.Mock).mockImplementation(() => ({
        showToast: mockShowToast,
        PerpsToastOptions: {
          formValidation: {
            orderForm: {
              limitPriceRequired: mockLimitPriceRequiredToast,
              validationError: jest.fn(),
            },
          },
          orderManagement: {
            market: {
              submitted: jest.fn(),
              confirmed: jest.fn(),
              creationFailed: jest.fn(),
            },
            limit: {
              submitted: jest.fn(),
              confirmed: jest.fn(),
              creationFailed: jest.fn(),
            },
          },
          positionManagement: {
            tpsl: {
              updateTPSLError: jest.fn(),
            },
          },
          dataFetching: {
            market: {
              error: {
                marketDataUnavailable: jest.fn(),
              },
            },
          },
        },
      }));

      // Set up route params
      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'ETH',
          direction: 'long',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for the TP/SL button to be rendered
      const tpSlButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.STOP_LOSS_BUTTON,
      );

      // Press the TP/SL button
      await act(async () => {
        fireEvent.press(tpSlButton);
      });

      // Verify that showToast was called with the correct argument
      expect(mockShowToast).toHaveBeenCalledTimes(1);
      expect(mockShowToast).toHaveBeenCalledWith(mockLimitPriceRequiredToast);

      // Verify that navigation to TP/SL screen was NOT triggered
      expect(mockNavigate).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          asset: expect.anything(),
        }),
      );
    });

    it('navigates to TP/SL screen on limit order with limit price', async () => {
      // Set up route params
      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'ETH',
          direction: 'long',
        },
      });

      // Override the context mock for a limit order WITH price
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 3,
          direction: 'long',
          type: 'limit',
          limitPrice: '3100', // Has a limit price
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '33.33',
          positionSize: '0.0333',
        },
      });

      // Also update the order form mock to match
      (usePerpsOrderForm as jest.Mock).mockImplementation(() => ({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 3,
          direction: 'long',
          type: 'limit',
          limitPrice: '3100',
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: jest.fn(),
        setTakeProfitPrice: jest.fn(),
        setStopLossPrice: jest.fn(),
        setLimitPrice: jest.fn(),
        setOrderType: jest.fn(),
        updateOrderForm: jest.fn(),
        handlePercentageAmount: jest.fn(),
        handleMaxAmount: jest.fn(),
        handleMinAmount: jest.fn(),
        optimizeOrderAmount: jest.fn(),
        maxPossibleAmount: 1000,
        setEstimatedFeeRate: jest.fn(),
        balanceForValidation: 1000,
        calculations: {
          marginRequired: '33.33',
          positionSize: '0.0333',
        },
      }));

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Wait for component to be ready
      await waitFor(() => {
        expect(
          screen.getByTestId(PerpsOrderViewSelectorsIDs.STOP_LOSS_BUTTON),
        ).toBeDefined();
      });

      // Find and press the TP/SL button
      const tpSlButton = screen.getByTestId(
        PerpsOrderViewSelectorsIDs.STOP_LOSS_BUTTON,
      );
      await act(async () => {
        fireEvent.press(tpSlButton);
      });

      // Verify that navigation to TP/SL screen was triggered
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.stringContaining('TPSL'),
          expect.objectContaining({
            asset: 'ETH',
            direction: 'long',
            leverage: 3,
            orderType: 'limit',
            limitPrice: '3100',
          }),
        );
      });
    });
  });
});
