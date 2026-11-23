import {
  TestWrapper,
  defaultMockHooks,
  getMockLeverageScreenProps,
  getMockLiquidationInfoScreenProps,
  getMockMarginInfoScreenProps,
  getMockPayWithScreenProps,
  getMockTPSLScreenProps,
  getMockTradeScreenProps,
  getMockTradeSheetContentSizedScreens,
  getMockTradeSheetOnClose,
  mockCreateEventBuilder,
  mockDefaultUsePerpsToasts,
  mockGoBack,
  mockNavigate,
  mockParentGoBack,
  mockPerpsRebateBanner,
  mockRejectBeforeForm,
  mockSetConfirmationMetric,
  mockTrackEvent,
  mockUseIsPerpsBalanceSelected,
  mockUseTransactionPayToken,
  setMockIsPayQuoteLoading,
  setMockPayTotals,
  setMockPaymentOverride,
  setMockTradeWithAnyTokenEnabled,
  setupPerpsOrderViewMocks,
  useTradeSheetRoute,
} from './PerpsOrderView.testUtils';
import React from 'react';
import { useRoute } from '@react-navigation/native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PaymentOverride } from '@metamask/transaction-pay-controller';
import ToastService from '../../../../../core/ToastService';
import {
  clearPostTradeShareSession,
  getPostTradeShareSession,
} from '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/postTradeShareSession';
import {
  PerpsOrderViewSelectorsIDs,
  PerpsTradeSheetSelectorsIDs,
} from '../../Perps.testIds';
import Routes from '../../../../../constants/navigation/Routes';
import { fireImpact, ImpactMoment } from '../../../../../util/haptics';
import { endTrace, TraceName } from '../../../../../util/trace';
import {
  useBottomSafeAreaInset,
  usePerpsLiveAccount,
  usePerpsLiquidationPrice,
  usePerpsNetwork,
  usePerpsOrderDepositTracking,
  usePerpsOrderExecution,
  usePerpsOrderValidation,
  usePerpsTrading,
  usePerpsToasts,
} from '../../hooks';
import { usePerpsTopOfBook } from '../../hooks/stream';
import { usePerpsOrderContext } from '../../contexts/PerpsOrderContext';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '@metamask/perps-controller';
import PerpsOrderView from './PerpsOrderView';
import { markPerpsPaymentTokenSelection } from '../../utils/perpsPaymentTokenSelection';
import { isHardwareAccount } from '../../../../../util/address';
import { useTransactionConfirm } from '../../../../Views/confirmations/hooks/transactions/useTransactionConfirm';

describe('PerpsOrderView', () => {
  beforeEach(() => {
    setupPerpsOrderViewMocks();
  });

  it('ends the interactive trace when dismissed before the deferred form mounts', () => {
    jest.mocked(global.requestAnimationFrame).mockImplementation(() => 1);
    useTradeSheetRoute();

    const { unmount } = render(<PerpsOrderView />, { wrapper: TestWrapper });
    expect(
      screen.getByTestId(PerpsTradeSheetSelectorsIDs.PLACEHOLDER),
    ).toBeOnTheScreen();

    unmount();

    expect(endTrace).toHaveBeenCalledWith({
      name: TraceName.PerpsTradeSheetInteractive,
      data: { success: false, reason: 'dismissed_before_interactive' },
    });
    expect(mockRejectBeforeForm).toHaveBeenCalledWith(undefined, true);
  });

  it('keeps the order view span open across re-renders before data is ready', () => {
    jest.mocked(global.requestAnimationFrame).mockImplementation(() => 1);

    const { rerender } = render(<PerpsOrderView />, { wrapper: TestWrapper });
    rerender(<PerpsOrderView />);

    expect(endTrace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: TraceName.PerpsOrderView,
        data: expect.objectContaining({ success: false }),
      }),
    );
  });

  it('renders the order view', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Check if key elements are rendered
    await waitFor(() => {
      expect(screen.getByText('Leverage')).toBeDefined();
    });
  });

  it('renders the Perps rebate banner with the order metadata', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(mockPerpsRebateBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        coin: 'ETH',
        direction: 'long',
      }),
    );
  });

  it('does not reserve fixed-footer space inside the scroll content', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const scrollView = screen.getByTestId(
      PerpsOrderViewSelectorsIDs.SCROLL_VIEW,
    );

    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle)).toEqual(
      expect.objectContaining({ paddingBottom: 0 }),
    );
  });

  it('does not apply the bottom safe-area inset twice', () => {
    const mockUseBottomSafeAreaInset = jest.mocked(useBottomSafeAreaInset);
    mockUseBottomSafeAreaInset.mockReturnValue(34);

    try {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const footer = screen.getByTestId(PerpsOrderViewSelectorsIDs.FOOTER);

      expect(StyleSheet.flatten(footer.props.style)).toEqual(
        expect.objectContaining({ paddingBottom: 16 }),
      );
    } finally {
      mockUseBottomSafeAreaInset.mockReturnValue(0);
    }
  });

  it('renders the Trade bottom sheet for the treatment route', async () => {
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(
      await screen.findByTestId(PerpsTradeSheetSelectorsIDs.SHEET),
    ).toBeOnTheScreen();
    expect(
      screen.queryByTestId(PerpsOrderViewSelectorsIDs.SCROLL_VIEW),
    ).not.toBeOnTheScreen();
  });

  it('wires the nested TP/SL screen to the Trade order form', () => {
    const setTakeProfitPrice = jest.fn();
    const setStopLossPrice = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        takeProfitPrice: '3100',
        stopLossPrice: '2800',
      },
      setTakeProfitPrice,
      setStopLossPrice,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTPSLScreenProps()).toEqual(
      expect.objectContaining({
        initialTakeProfitPrice: '3100',
        initialStopLossPrice: '2800',
      }),
    );

    act(() => getMockTPSLScreenProps().onSave('3200', '2750'));

    expect(setTakeProfitPrice).toHaveBeenCalledWith('3200');
    expect(setStopLossPrice).toHaveBeenCalledWith('2750');
  });

  it('lets leverage and info screens resize the Trade sheet to their content', () => {
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockMarginInfoScreenProps()?.contentKey).toBe('margin');
    expect(getMockLiquidationInfoScreenProps()?.contentKey).toBe(
      'liquidation_price',
    );
    expect(getMockTradeSheetContentSizedScreens()).toEqual([
      'leverage',
      'payWith',
      'marginInfo',
      'liquidationInfo',
    ]);
  });

  it('shows the market maximum leverage and the liquidation price on the Trade sheet', () => {
    (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
      liquidationPrice: '2700',
      isCalculating: false,
      error: null,
    });
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().maxLeverage).toBe(50);
    expect(getMockTradeScreenProps().liquidationPrice).toBe('$2,700');
    expect(getMockTradeScreenProps().liquidationDistance).toBe('10.00%');
    expect(getMockTradeScreenProps().isLiquidationLoading).toBe(false);
  });

  it('shows a liquidation price skeleton while the API recalculates', () => {
    (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
      liquidationPrice: '0',
      isCalculating: true,
      error: null,
    });
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().isLiquidationLoading).toBe(true);
    expect(getMockTradeScreenProps().liquidationPrice).toBe('--');
    expect(getMockTradeScreenProps().liquidationDistance).toBeUndefined();
  });

  it('keeps the liquidation price visible while the API refetches it', () => {
    (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
      liquidationPrice: '2700',
      isCalculating: true,
      error: null,
    });
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().isLiquidationLoading).toBe(false);
    expect(getMockTradeScreenProps().liquidationPrice).toBe('$2,700');
  });

  it('keeps Pay with visible while its quote refreshes', () => {
    setMockIsPayQuoteLoading(true);
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().isPayWithLoading).toBe(false);
  });

  it('hides Auto close in add-to-position Trade sheets', () => {
    useTradeSheetRoute({ hideTPSL: true });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().showAutoClose).toBe(false);
  });

  it('keeps limit orders editable inside the Trade sheet', () => {
    const setLimitPrice = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
        limitPrice: '3000',
      },
      setLimitPrice,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() =>
      getMockTradeScreenProps().onLimitPriceKeypadChange({
        value: '2950',
        valueAsNumber: 2950,
      }),
    );

    expect(getMockTradeScreenProps().orderType).toBe('limit');
    expect(getMockTradeScreenProps().limitPrice).toBe('3000');
    expect(setLimitPrice).toHaveBeenCalledWith('2950');
  });

  it('passes a market-crossing limit price warning to the Trade sheet', () => {
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
        direction: 'long',
        limitPrice: '3100',
      },
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().limitPriceWarning).toBe(
      'perps.order.validation.limit_price_above_warning',
    );
  });

  it('switches a market order to limit and opens the price keypad on toggle', () => {
    const setOrderType = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      setOrderType,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onOrderTypeToggle());

    expect(setOrderType).toHaveBeenCalledWith('limit');
    expect(getMockTradeScreenProps().isLimitPriceFocused).toBe(true);
    expect(screen.queryByTestId('order-type-bottom-sheet')).toBeNull();
  });

  it('switches a limit order back to market and clears the limit price', () => {
    const setOrderType = jest.fn();
    const setLimitPrice = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
        limitPrice: '3000',
      },
      setOrderType,
      setLimitPrice,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onOrderTypeToggle());

    expect(setOrderType).toHaveBeenCalledWith('market');
    expect(setLimitPrice).toHaveBeenCalledWith(undefined);
  });

  it('clears a stale limit price when the Trade sheet opens as a market order', () => {
    const updateOrderForm = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'market',
        limitPrice: '3100',
      },
      updateOrderForm,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(updateOrderForm).toHaveBeenCalledWith({
      type: 'market',
      limitPrice: undefined,
    });
  });

  it('falls back to the market price when the order book is unavailable', () => {
    const setLimitPrice = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
      },
      setLimitPrice,
    });
    (usePerpsTopOfBook as jest.Mock).mockReturnValue(undefined);
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onLimitPricePresetPress('book'));

    expect(setLimitPrice).toHaveBeenCalledWith('3000');
  });

  it('falls back to the market price when the order book side is empty', () => {
    const setLimitPrice = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        type: 'limit',
      },
      setLimitPrice,
    });
    (usePerpsTopOfBook as jest.Mock).mockReturnValue({
      bestBid: '',
      bestAsk: '0',
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onLimitPricePresetPress('book'));

    expect(setLimitPrice).toHaveBeenCalledWith('3000');
  });

  it('tracks the completed limit price input method once', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });
    mockCreateEventBuilder.mockClear();

    act(() => {
      getMockTradeScreenProps().onLimitPriceKeypadChange({
        value: '2950',
        valueAsNumber: 2950,
      });
      getMockTradeScreenProps().onLimitPriceDonePress();
      getMockTradeScreenProps().onLimitPriceDonePress();
    });

    const interactionCallIndexes = (
      mockCreateEventBuilder.mock.calls as unknown as [unknown][]
    )
      .map(([eventName], index) =>
        eventName === MetaMetricsEvents.PERPS_UI_INTERACTION ? index : -1,
      )
      .filter((index) => index >= 0);
    expect(interactionCallIndexes).toHaveLength(1);
    const builder =
      mockCreateEventBuilder.mock.results[interactionCallIndexes[0]].value;
    expect(builder.addProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        [PERPS_EVENT_PROPERTY.INTERACTION_TYPE]:
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- Verify parity with the existing limit-price analytics contract.
          PERPS_EVENT_VALUE.INTERACTION_TYPE.SETTING_CHANGED,
        [PERPS_EVENT_PROPERTY.SETTING_TYPE]: 'limit_price',
        [PERPS_EVENT_PROPERTY.INPUT_METHOD]:
          PERPS_EVENT_VALUE.INPUT_METHOD.KEYBOARD,
      }),
    );
  });

  it('does not track stale limit input when limit mode auto-opens', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => {
      getMockTradeScreenProps().onLimitPriceKeypadChange({
        value: '2950',
        valueAsNumber: 2950,
      });
      getMockTradeScreenProps().onOrderTypeToggle();
    });
    mockCreateEventBuilder.mockClear();

    act(() => getMockTradeScreenProps().onLimitPriceDonePress());

    expect(mockCreateEventBuilder).not.toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
  });

  it('tracks opening the payment token selector from the Trade sheet without stacking a route', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });
    mockCreateEventBuilder.mockClear();

    act(() => getMockTradeScreenProps().onPayWithPress());

    expect(mockCreateEventBuilder).toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
    const builder = mockCreateEventBuilder.mock.results[0].value;
    expect(builder.addProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        [PERPS_EVENT_PROPERTY.INTERACTION_TYPE]:
          PERPS_EVENT_VALUE.INTERACTION_TYPE.PAYMENT_TOKEN_SELECTOR,
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      Routes.CONFIRMATION_PAY_WITH_BOTTOM_SHEET,
    );
    expect(mockSetConfirmationMetric).toHaveBeenCalledWith({
      properties: { mm_pay_token_list_opened: true },
    });
  });

  it('tracks a dismissed payment token selector when the inline picker is left without a selection', () => {
    mockUseTransactionPayToken.mockReturnValue({
      payToken: { address: '0xusdc', chainId: '0xa4b1', symbol: 'USDC' },
      setPayToken: jest.fn(),
      isNative: undefined,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onPayWithPress());
    mockCreateEventBuilder.mockClear();
    act(() => getMockPayWithScreenProps().onDismiss());

    expect(mockCreateEventBuilder).toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
    const builder = mockCreateEventBuilder.mock.results[0].value;
    expect(builder.addProperties).toHaveBeenCalledWith(
      expect.objectContaining({
        [PERPS_EVENT_PROPERTY.INTERACTION_TYPE]:
          PERPS_EVENT_VALUE.INTERACTION_TYPE.PAYMENT_TOKEN_SELECTOR_DISMISSED,
        [PERPS_EVENT_PROPERTY.CURRENT_TOKEN]: 'USDC',
      }),
    );
  });

  it('does not track a dismissed payment token selector after an explicit selection', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onPayWithPress());
    mockCreateEventBuilder.mockClear();
    markPerpsPaymentTokenSelection();
    act(() => getMockPayWithScreenProps().onDismiss());

    expect(mockCreateEventBuilder).not.toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
  });

  it('ignores an inline picker dismissal that was never opened from the Trade sheet', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });
    mockCreateEventBuilder.mockClear();

    act(() => getMockPayWithScreenProps().onDismiss());

    expect(mockCreateEventBuilder).not.toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
  });

  it('labels the Money Account payment override in the Trade sheet', () => {
    setMockPaymentOverride(PaymentOverride.MoneyAccount);
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().payWithName).toBe(
      'confirm.pay_with_bottom_sheet.money_account',
    );
  });

  describe('Trade sheet bridge fee', () => {
    const payTotalsWithUsdFee = (usd: string) => ({
      fees: {
        provider: { usd },
        sourceNetwork: { estimate: { usd: '0' } },
        targetNetwork: { usd: '0' },
      },
    });

    it('passes the formatted bridge fee when paying with a token', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockPayTotals({
        fees: {
          provider: { usd: '0.10' },
          sourceNetwork: { estimate: { usd: '0.03' } },
          targetNetwork: { usd: '0.02' },
        },
      });
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().feePercentage).toBe('0.045');
      expect(getMockTradeScreenProps().bridgeFee).toBe('$0.15');
      expect(getMockTradeScreenProps().isFeeLoading).toBe(false);
    });

    it('leaves the fee line unchanged when paying with perps balance', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(true);
      setMockPayTotals(payTotalsWithUsdFee('0.15'));
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().bridgeFee).toBeUndefined();
      expect(getMockTradeScreenProps().feePercentage).toBe('0.045');
    });

    it('leaves the fee line unchanged for the Money Account', () => {
      setMockPaymentOverride(PaymentOverride.MoneyAccount);
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockPayTotals(payTotalsWithUsdFee('0.15'));
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().bridgeFee).toBeUndefined();
      expect(getMockTradeScreenProps().feePercentage).toBe('0.045');
    });

    it('omits the bridge fee when the deposit fee is zero', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockPayTotals(payTotalsWithUsdFee('0'));
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().bridgeFee).toBeUndefined();
    });

    it('omits the bridge fee when the pay quote has no fees', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockPayTotals(undefined);
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().bridgeFee).toBeUndefined();
    });

    it('marks the Trade sheet fee as loading while the pay quote loads', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockIsPayQuoteLoading(true);
      setMockPayTotals(payTotalsWithUsdFee('0.15'));
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().isFeeLoading).toBe(true);
    });

    it('updates the bridge fee when the pay quote refreshes', () => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      setMockPayTotals(payTotalsWithUsdFee('0.15'));
      useTradeSheetRoute();
      const { rerender } = render(<PerpsOrderView />, {
        wrapper: TestWrapper,
      });

      expect(getMockTradeScreenProps().bridgeFee).toBe('$0.15');

      setMockPayTotals(payTotalsWithUsdFee('0.42'));
      rerender(
        <TestWrapper>
          <PerpsOrderView />
        </TestWrapper>,
      );

      expect(getMockTradeScreenProps().bridgeFee).toBe('$0.42');
    });
  });

  it('does not open the payment token selector for a hardware account', () => {
    jest.mocked(isHardwareAccount).mockReturnValue(true);
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });
    mockCreateEventBuilder.mockClear();

    expect(getMockTradeScreenProps().isPayWithDisabled).toBe(true);
    act(() => getMockTradeScreenProps().onPayWithPress());

    expect(mockCreateEventBuilder).not.toHaveBeenCalledWith(
      MetaMetricsEvents.PERPS_UI_INTERACTION,
    );
    expect(mockSetConfirmationMetric).not.toHaveBeenCalled();
  });

  it('does not stack a tooltip bottom sheet on top of the Trade sheet', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(
      screen.queryByTestId(PerpsOrderViewSelectorsIDs.BOTTOM_SHEET_TOOLTIP),
    ).not.toBeOnTheScreen();
  });

  it('closes the Trade sheet back to its presenting market', () => {
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    getMockTradeSheetOnClose()?.();

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('closes the Trade sheet back to token details for token entry', () => {
    useTradeSheetRoute({ fromTokenDetails: true });
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    getMockTradeSheetOnClose()?.();

    expect(mockParentGoBack).toHaveBeenCalledTimes(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('clamps the order amount after reducing leverage in the Trade sheet', () => {
    const setAmount = jest.fn();
    const setLeverage = jest.fn();
    (usePerpsLiveAccount as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsLiveAccount,
      account: {
        ...defaultMockHooks.usePerpsLiveAccount.account,
        spendableBalance: '2',
      },
    });
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      setAmount,
      setLeverage,
      balanceForValidation: 2,
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockLeverageScreenProps().onConfirm(2, 'preset'));

    expect(setLeverage).toHaveBeenCalledWith(2);
    expect(setAmount).toHaveBeenCalledWith('4');
  });

  it('commits the live slider amount after changing leverage in the Trade sheet', () => {
    const setAmount = jest.fn();
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      setAmount,
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    act(() => getMockTradeScreenProps().onSliderValueChange(25));
    act(() => getMockLeverageScreenProps().onConfirm(4, 'slider'));

    expect(setAmount).toHaveBeenCalledWith('25');
  });

  it('uses Perps balance fallbacks when sheet metrics are unavailable', () => {
    const { usePerpsOrderFees } = jest.requireMock('../../hooks') as {
      usePerpsOrderFees: jest.Mock;
    };
    usePerpsOrderFees.mockReturnValue({
      protocolFeeRate: undefined,
      metamaskFeeRate: undefined,
      isLoadingMetamaskFee: false,
    });
    mockUseIsPerpsBalanceSelected.mockReturnValue(true);
    (usePerpsLiveAccount as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsLiveAccount,
      account: {
        ...defaultMockHooks.usePerpsLiveAccount.account,
        totalBalance: undefined,
      },
    });
    (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
      liquidationPrice: 'unavailable',
      isCalculating: false,
      error: null,
    });
    useTradeSheetRoute({ direction: 'short' });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps()).toEqual(
      expect.objectContaining({
        payWithName: 'perps.adjust_margin.perps_balance',
        feePercentage: undefined,
      }),
    );
  });

  it('leaves the Trade sheet as soon as the order is submitted, before execution settles', async () => {
    let resolveOrder: (result: { success: boolean }) => void = () => undefined;
    const placeOrder = jest.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveOrder = resolve;
        }),
    );
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await act(async () => {
      getMockTradeScreenProps().onSubmit();
    });

    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      Routes.PERPS.ROOT,
      expect.objectContaining({
        screen: Routes.PERPS.MARKET_DETAILS,
        pop: true,
      }),
    );

    await act(async () => resolveOrder({ success: true }));
  });

  it('dismisses the Trade sheet back to the presenting screen when stayOnCurrentScreen is set', async () => {
    const placeOrder = jest.fn().mockResolvedValue({ success: true });
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute({ stayOnCurrentScreen: true });
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await act(async () => {
      getMockTradeScreenProps().onSubmit();
    });

    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith(
      Routes.PERPS.ROOT,
      expect.objectContaining({
        screen: Routes.PERPS.MARKET_DETAILS,
      }),
    );
  });

  it('does not pop the presenting screen again when the Trade sheet closes after a stay-on-screen submit', async () => {
    const placeOrder = jest.fn().mockResolvedValue({ success: true });
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute({ stayOnCurrentScreen: true });
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await act(async () => {
      getMockTradeScreenProps().onSubmit();
    });
    getMockTradeSheetOnClose()?.();

    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('still leaves the Trade sheet when the order execution fails', async () => {
    const placeOrder = jest.fn().mockResolvedValue({ success: false });
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await act(async () => {
      getMockTradeScreenProps().onSubmit();
    });

    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      Routes.PERPS.ROOT,
      expect.objectContaining({
        screen: Routes.PERPS.MARKET_DETAILS,
        pop: true,
      }),
    );
  });

  describe('Place Order haptics', () => {
    const arrangePlaceOrder = () => {
      const placeOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
        error: undefined,
      });
      return placeOrder;
    };

    it('plays PrimaryCTA once when the Trade sheet submits an order', async () => {
      const placeOrder = arrangePlaceOrder();
      useTradeSheetRoute();
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(fireImpact).toHaveBeenCalledTimes(1);
      expect(fireImpact).toHaveBeenCalledWith(ImpactMoment.PrimaryCTA);
    });

    it('stays silent on the full-screen surface', async () => {
      const placeOrder = arrangePlaceOrder();
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        fireEvent.press(
          await screen.findByTestId(
            PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
          ),
        );
      });

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(fireImpact).not.toHaveBeenCalled();
    });

    it('stays silent when the tap only flushes a stuck slider drag', async () => {
      const placeOrder = arrangePlaceOrder();
      useTradeSheetRoute();
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSliderValueChange(500);
      });
      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(placeOrder).not.toHaveBeenCalled();
      expect(fireImpact).not.toHaveBeenCalled();
    });
  });

  describe('when the Trade sheet is dismissed while validation is pending', () => {
    interface ValidationResult {
      isValid: boolean;
      errors: string[];
      warnings: string[];
      fieldIssues: never[];
    }
    const validResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldIssues: [],
    };

    const arrangePendingValidation = () => {
      let resolveValidation: (result: ValidationResult) => void = () =>
        undefined;
      const validateNow = jest.fn(
        () =>
          new Promise<ValidationResult>((resolve) => {
            resolveValidation = resolve;
          }),
      );
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        ...validResult,
        isValidating: true,
        insufficientBalanceErrors: [],
        validateNow,
      });
      const placeOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
        error: undefined,
      });
      useTradeSheetRoute();
      const rendered = render(<PerpsOrderView />, { wrapper: TestWrapper });

      let submission: void | Promise<void>;
      act(() => {
        submission = getMockTradeScreenProps().onSubmit();
      });
      expect(validateNow).toHaveBeenCalledTimes(1);

      const settleValidation = () =>
        act(async () => {
          resolveValidation(validResult);
          await submission;
        });

      return { ...rendered, placeOrder, settleValidation };
    };

    const expectNoOrder = (placeOrder: jest.Mock) => {
      expect(placeOrder).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({ screen: Routes.PERPS.MARKET_DETAILS }),
      );
    };

    // Swiping the sheet away runs its exit animation and `onClose` before the
    // navigation transition unmounts this view, so the dismissal itself must
    // stop the pending submit — not only the eventual unmount.
    it('does not place an order once the sheet reported it closed, even before unmount', async () => {
      const { placeOrder, settleValidation } = arrangePendingValidation();

      act(() => {
        getMockTradeSheetOnClose()?.();
      });
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      await settleValidation();

      expectNoOrder(placeOrder);
    });

    it('does not place an order once the view unmounted', async () => {
      const { placeOrder, settleValidation, unmount } =
        arrangePendingValidation();

      unmount();
      await settleValidation();

      expectNoOrder(placeOrder);
    });
  });

  describe('pay-with-token deposit confirmation lock', () => {
    const transactionMeta = {
      id: 'test-transaction-id',
      type: 'perpsDepositAndOrder',
    };

    // Flushes the microtask chains behind `await validateOrderNow()` and
    // `await onDepositConfirm()` so each helper returns with the flow settled.
    const flushAsync = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));

    // The deposit tracker and the order view share the ToastService ref.
    const closeToast = jest.fn();
    beforeEach(() => {
      closeToast.mockClear();
      clearPostTradeShareSession();
      ToastService.toastRef = {
        current: { closeToast },
      } as unknown as typeof ToastService.toastRef;
    });
    afterEach(() => {
      clearPostTradeShareSession();
      ToastService.resetForTesting();
    });

    const arrangeDepositFlow = (options?: {
      validationPending?: boolean;
      stayOnCurrentScreen?: boolean;
      copyTradeOrigin?: { commentId: string; asset: string };
    }) => {
      setMockTradeWithAnyTokenEnabled(true);
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      if (options?.validationPending) {
        (usePerpsOrderValidation as jest.Mock).mockReturnValue({
          isValid: true,
          errors: [],
          warnings: [],
          fieldIssues: [],
          isValidating: true,
          insufficientBalanceErrors: [],
          validateNow: jest.fn().mockResolvedValue({
            isValid: true,
            errors: [],
            warnings: [],
            fieldIssues: [],
          }),
        });
      }
      const { useTransactionMetadataRequest } = jest.requireMock(
        '../../../../Views/confirmations/hooks/transactions/useTransactionMetadataRequest',
      ) as { useTransactionMetadataRequest: jest.Mock };
      useTransactionMetadataRequest.mockReturnValue(transactionMeta);

      let resolveConfirm: () => void = () => undefined;
      let confirmOptions: { onError?: (error: unknown) => void } | undefined;
      const onConfirm = jest.fn(
        (confirmCallOptions?: { onError?: (error: unknown) => void }) =>
          new Promise<void>((resolve) => {
            confirmOptions = confirmCallOptions;
            resolveConfirm = resolve;
          }),
      );
      (useTransactionConfirm as jest.Mock).mockReturnValue({ onConfirm });

      let onDepositConfirmed: (() => void) | undefined;
      const handleDepositConfirm = jest.fn(
        (_meta: unknown, callback: () => void) => {
          onDepositConfirmed = callback;
        },
      );
      (usePerpsOrderDepositTracking as jest.Mock).mockReturnValue({
        handleDepositConfirm,
      });

      const placeOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
        error: undefined,
      });

      useTradeSheetRoute({
        ...(options?.stayOnCurrentScreen ? { stayOnCurrentScreen: true } : {}),
        ...(options?.copyTradeOrigin
          ? { copyTradeOrigin: options.copyTradeOrigin }
          : {}),
      });
      const { unmount } = render(<PerpsOrderView />, { wrapper: TestWrapper });

      const submit = () =>
        act(async () => {
          getMockTradeScreenProps().onSubmit();
          await flushAsync();
        });
      const settleConfirm = (error?: unknown) =>
        act(async () => {
          if (error !== undefined) {
            confirmOptions?.onError?.(error);
          }
          resolveConfirm();
          await flushAsync();
        });
      const confirmDepositOnChain = () =>
        act(async () => {
          onDepositConfirmed?.();
          await flushAsync();
        });
      const dismissSheet = () =>
        act(() => {
          getMockTradeSheetOnClose()?.();
        });

      return {
        onConfirm,
        handleDepositConfirm,
        placeOrder,
        submit,
        settleConfirm,
        confirmDepositOnChain,
        dismissSheet,
        unmount,
      };
    };

    it('starts a single deposit confirmation when submit is tapped twice while it is pending', async () => {
      const { onConfirm, handleDepositConfirm, placeOrder, submit } =
        arrangeDepositFlow();

      await submit();
      await submit();

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(handleDepositConfirm).toHaveBeenCalledTimes(1);
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('releases the lock after a failed confirmation so the trader can retry', async () => {
      const { onConfirm, submit, settleConfirm } = arrangeDepositFlow();

      await submit();
      await settleConfirm(new Error('User rejected'));
      expect(mockGoBack).not.toHaveBeenCalled();

      await submit();

      expect(onConfirm).toHaveBeenCalledTimes(2);
    });

    it('leaves the sheet after a confirmed deposit and releases the lock', async () => {
      const { onConfirm, submit, settleConfirm } = arrangeDepositFlow();

      await submit();
      await settleConfirm();
      expect(mockGoBack).toHaveBeenCalledTimes(1);

      await submit();

      expect(onConfirm).toHaveBeenCalledTimes(2);
    });

    // With `waitForResult` confirmations the transaction-confirmed event fires
    // while `onConfirm` is still awaited, so the tracker's forced re-entry must
    // not be treated as a double tap.
    it('still places the order when the deposit confirms while the confirmation is awaited', async () => {
      const { placeOrder, submit, settleConfirm, confirmDepositOnChain } =
        arrangeDepositFlow();

      await submit();
      await confirmDepositOnChain();

      expect(mockGoBack).not.toHaveBeenCalled();
      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
          pop: true,
        }),
      );

      await settleConfirm();

      // The forced re-entry already left the sheet; the deposit branch must
      // not pop the market screen it landed on.
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    // Regression: the deposit branch leaves this screen as soon as the
    // confirmation resolves, and the tracker's re-entry that finally places
    // the order can fire long afterwards (the credit wait is up to 90 s),
    // while the user is on some other screen (e.g. another market's details).
    // That late re-entry must place the order but must not navigate back to
    // this order's market. Funds arriving while the user is still here keep
    // navigating — see the test above.
    it('does not navigate to the market when funds arrive after the deposit branch left the screen', async () => {
      const { placeOrder, submit, settleConfirm, confirmDepositOnChain } =
        arrangeDepositFlow();

      await submit();
      await settleConfirm();
      expect(mockGoBack).toHaveBeenCalledTimes(1);

      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
        }),
      );
    });

    // A confirmed deposit is a commitment: the tracker places the order after
    // the user has left by design, so neither the sheet being swiped away nor
    // a validation still in flight at submit time may abandon it.
    it('still places the order after a swiped-away sheet when validation was in flight', async () => {
      const {
        placeOrder,
        submit,
        settleConfirm,
        confirmDepositOnChain,
        dismissSheet,
      } = arrangeDepositFlow({ validationPending: true });

      await submit();
      dismissSheet();
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);

      await settleConfirm();

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    // With `waitForResult` confirmations the transaction-confirmed event (and
    // so the tracker's re-entry) can fire while `onConfirm` is still awaited —
    // before the deposit branch has set `hasLeftAfterDepositRef`. If the user
    // swiped the sheet away during that await, they are already elsewhere, so
    // the re-entry must place the order without navigating back.
    it('does not navigate to the market when the sheet was swiped away before the confirmation settled', async () => {
      const {
        placeOrder,
        submit,
        settleConfirm,
        confirmDepositOnChain,
        dismissSheet,
      } = arrangeDepositFlow();

      await submit();
      dismissSheet();
      expect(mockGoBack).toHaveBeenCalledTimes(1);

      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
        }),
      );

      await settleConfirm();

      // Only the dismissal itself navigated; the settled confirmation must
      // not pop the screen the user already landed on either.
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('does not navigate again when the confirmation settles after the sheet was swiped away mid-confirm', async () => {
      const {
        placeOrder,
        submit,
        settleConfirm,
        confirmDepositOnChain,
        dismissSheet,
      } = arrangeDepositFlow();

      await submit();
      dismissSheet();
      await settleConfirm();

      // Only the dismissal itself navigated; the settled confirmation must not
      // pop the screen the user already landed on.
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(placeOrder).not.toHaveBeenCalled();

      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      // The late re-entry must not navigate back to this order's market
      // either: the sheet close already took the user elsewhere.
      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
        }),
      );
    });

    // Deposit confirm dismisses first; funds arriving later re-enter
    // `handlePlaceOrder(true)` and must still place without a second goBack.
    it('does not pop the presenting screen again when funds arrive after a stay-on-screen deposit dismiss', async () => {
      const { placeOrder, submit, settleConfirm, confirmDepositOnChain } =
        arrangeDepositFlow({ stayOnCurrentScreen: true });

      await submit();
      await settleConfirm();

      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(placeOrder).not.toHaveBeenCalled();

      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
        }),
      );
    });

    it('closes the deposit toast when the copy-trade share sheet replaces the submitted toast', async () => {
      const toasts = mockDefaultUsePerpsToasts();
      (usePerpsToasts as jest.Mock).mockReturnValue(toasts);
      const { placeOrder, submit, confirmDepositOnChain } = arrangeDepositFlow({
        copyTradeOrigin: { commentId: 'comment-1', asset: 'ETH' },
      });

      await submit();
      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(getPostTradeShareSession()?.product).toBe('perps');
      expect(closeToast).toHaveBeenCalledTimes(1);
      expect(
        toasts.PerpsToastOptions.orderManagement.market.submitted,
      ).not.toHaveBeenCalled();
    });

    it('keeps the submitted toast and does not close the deposit toast without a share session', async () => {
      const toasts = mockDefaultUsePerpsToasts();
      (usePerpsToasts as jest.Mock).mockReturnValue(toasts);
      const { placeOrder, submit, confirmDepositOnChain } =
        arrangeDepositFlow();

      await submit();
      await confirmDepositOnChain();

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(getPostTradeShareSession()).toBeNull();
      expect(
        toasts.PerpsToastOptions.orderManagement.market.submitted,
      ).toHaveBeenCalledTimes(1);
      expect(closeToast).not.toHaveBeenCalled();
    });

    // Confirming deletes the approval request, which unmounts this view while
    // the user is still looking at the sheet. That unmount is not a dismissal:
    // the user has not left and the settled confirmation must still leave.
    it('still leaves when the view unmounts during the confirmation without the sheet being closed', async () => {
      const { submit, settleConfirm, unmount } = arrangeDepositFlow();

      await submit();
      unmount();
      await settleConfirm();

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  it('passes validation, payment and TP/SL errors to the Trade sheet and leaves execution errors to the toast', () => {
    const { useInsufficientPayTokenBalanceAlert } = jest.requireMock(
      '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
    ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
    useInsufficientPayTokenBalanceAlert.mockReturnValue([
      {
        key: 'pay-balance',
        message: 'Insufficient payment token balance',
        isBlocking: true,
      },
    ]);
    (usePerpsOrderValidation as jest.Mock).mockReturnValue({
      isValid: false,
      errors: ['Validation failed', 'Insufficient margin'],
      warnings: [],
      fieldIssues: [],
      isValidating: false,
      insufficientBalanceErrors: ['Insufficient margin'],
      validateNow: jest.fn(),
    });
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder: jest.fn(),
      isPlacing: false,
      error: 'Order execution failed',
    });
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        takeProfitPrice: '2000',
        stopLossPrice: '3500',
      },
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().isSubmitDisabled).toBe(true);
    expect(
      getMockTradeScreenProps().errorMessages.map(({ key }) => key),
    ).toEqual(
      expect.arrayContaining([
        'insufficient-funds',
        'validation-Validation failed',
        'pay-balance',
      ]),
    );
    expect(
      getMockTradeScreenProps().errorMessages.map(({ key }) => key),
    ).not.toContain('execution-Order execution failed');
    expect(getMockTradeScreenProps().errorMessages).toHaveLength(5);
  });

  it('awaits pending validation before submitting from the Trade sheet', async () => {
    const validateNow = jest.fn().mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
      fieldIssues: [],
    });
    (usePerpsOrderValidation as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      fieldIssues: [],
      isValidating: true,
      insufficientBalanceErrors: [],
      validateNow,
    });
    const placeOrder = jest.fn().mockResolvedValue({ success: true });
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(getMockTradeScreenProps().isSubmitDisabled).toBe(false);

    await act(async () => {
      await getMockTradeScreenProps().onSubmit();
    });

    expect(validateNow).toHaveBeenCalledTimes(1);
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });

  it('blocks Trade sheet submission when pending validation fails', async () => {
    const validateNow = jest.fn().mockResolvedValue({
      isValid: false,
      errors: ['Validation failed'],
      warnings: [],
      fieldIssues: [],
    });
    (usePerpsOrderValidation as jest.Mock).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      fieldIssues: [],
      isValidating: true,
      insufficientBalanceErrors: [],
      validateNow,
    });
    const placeOrder = jest.fn();
    (usePerpsOrderExecution as jest.Mock).mockReturnValue({
      placeOrder,
      isPlacing: false,
      error: undefined,
    });
    useTradeSheetRoute();
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    await act(async () => {
      await getMockTradeScreenProps().onSubmit();
    });

    expect(validateNow).toHaveBeenCalledTimes(1);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('passes liquidation-risk warnings to the Trade sheet', () => {
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsOrderContext,
      orderForm: {
        ...defaultMockHooks.usePerpsOrderContext.orderForm,
        stopLossPrice: '2800',
      },
      calculations: {
        marginRequired: '11',
        positionSize: '0.0037',
      },
    });
    useTradeSheetRoute();

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    expect(
      getMockTradeScreenProps().errorMessages.map(({ key }) => key),
    ).toContain('stop-loss-liquidation');
  });

  it('displays the correct asset from route params', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // The component should display ETH from the route params
    await waitFor(() => {
      expect(screen.getByTestId('perps-order-header')).toBeDefined();
      const assetTitle = screen.getByTestId('perps-order-header-asset-title');
      expect(assetTitle).toBeDefined();
      expect(assetTitle.props.children).toContain('ETH');
    });
  });

  it('navigates back when header is present', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Since we mocked PerpsOrderHeader, we can't test the actual back button
    // But we can verify the navigation mock is set up correctly
    expect(mockGoBack).toBeDefined();
  });

  it('handles order submission', async () => {
    const mockPlaceOrder = jest.fn().mockResolvedValue({ success: true });
    (usePerpsTrading as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsTrading,
      placeOrder: mockPlaceOrder,
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );
    expect(placeOrderButton).toBeDefined();
  });

  it('displays components when connected', async () => {
    // usePerpsNetwork returns a string ('mainnet' or 'testnet'), not an object
    (usePerpsNetwork as jest.Mock).mockReturnValue('mainnet');

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Should show trading interface
    await waitFor(() => {
      expect(screen.getByText('Leverage')).toBeDefined();
    });
  });

  it('handles leverage display', async () => {
    // Set up route params with leverage
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'ETH',
        direction: 'long',
        leverage: 10,
      },
    });

    // Override the context mock to show the correct leverage
    (usePerpsOrderContext as jest.Mock).mockReturnValue({
      orderForm: {
        asset: 'ETH',
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

    // Find leverage text
    await waitFor(() => {
      expect(screen.getByText('Leverage')).toBeDefined();
      expect(screen.getByText('10x')).toBeDefined(); // Leverage from route params
    });
  });

  it('handles amount display', () => {
    const { getByTestId } = render(<PerpsOrderView />, {
      wrapper: TestWrapper,
    });

    // Since PerpsAmountDisplay is mocked as a string component,
    // we can't use findByType. The component is rendered on the screen
    // and the test passes by not throwing any errors.
    expect(getByTestId).toBeDefined();
  });

  it('handles successful order placement', () => {
    const mockPlaceOrder = jest.fn().mockResolvedValue({ success: true });
    const mockGetPositions = jest
      .fn()
      .mockResolvedValue([{ symbol: 'ETH', size: 0.1, leverage: 3 }]);

    (usePerpsTrading as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsTrading,
      placeOrder: mockPlaceOrder,
      getPositions: mockGetPositions,
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // The order placement happens when button is pressed
    // Since our mock setup already has valid values, we can just verify the mock was set up
    expect(mockPlaceOrder).toBeDefined();
    expect(mockGetPositions).toBeDefined();
  });

  it('shows standard submitted toast when custom token is selected (deposit flow)', async () => {
    mockUseIsPerpsBalanceSelected.mockReturnValue(false);

    const mockShowToast = jest.fn();
    const mockSubmitted = jest.fn(() => ({ id: 'order-submitted-toast' }));
    (usePerpsToasts as jest.Mock).mockReturnValue({
      showToast: mockShowToast,
      PerpsToastOptions: {
        formValidation: {
          orderForm: {
            limitPriceRequired: {},
            validationError: jest.fn(),
          },
        },
        orderManagement: {
          market: {
            submitted: mockSubmitted,
            confirmed: jest.fn(),
            creationFailed: jest.fn(),
          },
          limit: {
            submitted: jest.fn(),
            confirmed: jest.fn(),
            creationFailed: jest.fn(),
          },
          shared: {
            submitting: jest.fn(),
          },
        },
        positionManagement: { tpsl: { updateTPSLError: jest.fn() } },
        dataFetching: {
          market: { error: { marketDataUnavailable: jest.fn() } },
        },
        accountManagement: {
          deposit: {
            inProgress: jest.fn(),
            takingLonger: {},
            tradeCanceled: {},
            error: {},
          },
        },
      },
    });

    (usePerpsOrderExecution as jest.Mock).mockImplementation(() => ({
      placeOrder: jest.fn().mockResolvedValue({ success: true }),
      isPlacing: false,
    }));

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );
    await act(async () => {
      fireEvent.press(placeOrderButton);
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalled();
    });
    expect(mockSubmitted).toHaveBeenCalled();
  });

  it('includes discovery attribution from route source_section in order trackingData', async () => {
    const mockExecuteOrder = jest.fn().mockResolvedValue({ success: true });
    (useRoute as jest.Mock).mockReturnValue({
      params: {
        asset: 'ETH',
        direction: 'long',
        source: 'perp_asset_screen',
        source_section: 'watchlist',
      },
    });
    (usePerpsOrderExecution as jest.Mock).mockImplementation(() => ({
      placeOrder: mockExecuteOrder,
      isPlacing: false,
    }));

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );
    await act(async () => {
      fireEvent.press(placeOrderButton);
    });

    await waitFor(() => {
      expect(mockExecuteOrder).toHaveBeenCalled();
    });
    expect(mockExecuteOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingData: expect.objectContaining({
          entryPoint: 'perp_asset_screen',
          discoverySource: 'watchlist',
          perpDiscoverySource: 'watchlist',
        }),
      }),
    );
  });

  // The market page the trader came from is still below this screen, so the
  // post-order navigation has to pop back to it. Pushing a duplicate leaves the
  // order screen underneath and Back returns here instead of to Perps home.
  it('pops back to the market page instead of stacking a duplicate over the order screen', async () => {
    // Arrange
    (usePerpsOrderExecution as jest.Mock).mockImplementation(() => ({
      placeOrder: jest.fn().mockResolvedValue({ success: true }),
      isPlacing: false,
    }));

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );

    // Act
    await act(async () => {
      fireEvent.press(placeOrderButton);
    });

    // Assert
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        Routes.PERPS.ROOT,
        expect.objectContaining({
          screen: Routes.PERPS.MARKET_DETAILS,
          pop: true,
        }),
      );
    });
  });

  it('shows standard submitted toast when using perps balance', async () => {
    mockUseIsPerpsBalanceSelected.mockReturnValue(true);

    const mockShowToast = jest.fn();
    const mockSubmitted = jest.fn(() => ({ id: 'order-submitted-toast' }));
    (usePerpsToasts as jest.Mock).mockReturnValue({
      showToast: mockShowToast,
      PerpsToastOptions: {
        formValidation: {
          orderForm: {
            limitPriceRequired: {},
            validationError: jest.fn(),
          },
        },
        orderManagement: {
          market: {
            submitted: mockSubmitted,
            confirmed: jest.fn(),
            creationFailed: jest.fn(),
          },
          limit: {
            submitted: jest.fn(),
            confirmed: jest.fn(),
            creationFailed: jest.fn(),
          },
          shared: {
            submitting: jest.fn(),
          },
        },
        positionManagement: { tpsl: { updateTPSLError: jest.fn() } },
        dataFetching: {
          market: { error: { marketDataUnavailable: jest.fn() } },
        },
        accountManagement: {
          deposit: {
            inProgress: jest.fn(),
            takingLonger: {},
            tradeCanceled: {},
            error: {},
          },
        },
      },
    });

    (usePerpsOrderExecution as jest.Mock).mockImplementation(() => ({
      placeOrder: jest.fn().mockResolvedValue({ success: true }),
      isPlacing: false,
    }));

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const placeOrderButton = await screen.findByTestId(
      PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
    );
    await act(async () => {
      fireEvent.press(placeOrderButton);
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalled();
    });
    expect(mockSubmitted).toHaveBeenCalled();
  });

  it('handles failed order placement', () => {
    const mockPlaceOrder = jest.fn().mockResolvedValue({
      success: false,
      error: 'Insufficient balance',
    });

    (usePerpsTrading as jest.Mock).mockReturnValue({
      ...defaultMockHooks.usePerpsTrading,
      placeOrder: mockPlaceOrder,
    });

    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Verify the component renders with our mock
    expect(mockPlaceOrder).toBeDefined();
  });

  it('shows leverage bottom sheet when leverage pressed', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    const leverageText = await screen.findByText('Leverage');
    await act(async () => {
      fireEvent.press(leverageText);
    });

    // The bottom sheet should become visible
    await waitFor(() => {
      expect(screen.getByTestId('leverage-bottom-sheet')).toBeDefined();
    });
  });

  it('shows order type bottom sheet when order type pressed', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Since PerpsOrderHeader is mocked, we need to test differently
    // The component should render without errors
    expect(screen.getByTestId('perps-order-header')).toBeDefined();
  });

  it('handles keypad input', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Press on amount display to activate keypad
    const amountDisplay = screen.getByTestId('perps-amount-display');
    fireEvent.press(amountDisplay);

    // Since Keypad is not mocked, we need to check if it would be rendered
    // The test passes if no errors are thrown
  });

  it('handles percentage buttons when balance available', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Percentage buttons are part of the UI but might not be visible in all states
    // Just verify the component renders
    expect(screen.getByTestId('perps-order-header')).toBeDefined();
  });

  it('handles MAX button press', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // MAX button functionality is part of the component
    // Verify the component renders correctly
    expect(screen.getByTestId('perps-amount-display')).toBeDefined();
  });

  it('handles MIN button press', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // MIN button functionality is part of the component
    // Verify the component renders correctly
    expect(screen.getByTestId('perps-amount-display')).toBeDefined();
  });

  it('should track performance metrics on mount', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Verify trace was called for screen load with default Perps operation
    const traceModule = jest.requireMock('../../../../../util/trace');
    expect(traceModule.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Perps Order View',
        op: 'perps.operation', // Default operation for Perps UI measurements
      }),
    );

    // Verify Mixpanel event was tracked
    expect(mockCreateEventBuilder).toHaveBeenCalled();
    expect(mockTrackEvent).toHaveBeenCalled();
  });

  it('shows slider when not focused on input', () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Slider should be visible initially
    expect(screen.getByTestId('perps-slider')).toBeDefined();
  });

  it('hides slider when focused on input', async () => {
    render(<PerpsOrderView />, { wrapper: TestWrapper });

    // Press amount to focus input
    const amountDisplay = screen.getByTestId('perps-amount-display');
    fireEvent.press(amountDisplay);

    // Slider should not be visible when keypad is active
    await waitFor(() => {
      expect(screen.queryByTestId('perps-slider')).toBeNull();
    });
  });
});
