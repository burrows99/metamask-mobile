import {
  TestWrapper,
  applyDefaultHookMocks,
  defaultMockHooks,
  getMockTradeScreenProps,
  mockCanShareCopyTrade,
  mockCreateEventBuilder,
  mockDefaultUsePerpsToasts,
  mockGoBack,
  mockNavigate,
  mockProviderEffectiveAvailableBalance,
  mockResolvePostTradePrompt,
  mockUseIsPerpsBalanceSelected,
  mockUseTransactionPayToken,
  setMockIsPayQuoteLoading,
  setMockIsPerpsProModeActive,
  setMockPayTokenAccountBalanceUsd,
  setMockPayTotals,
  setMockPerpsSizeDenomination,
  setMockSelectedEvmAccount,
  setupPerpsOrderViewMocks,
  useTradeSheetRoute,
} from './PerpsOrderView.testUtils';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Engine from '../../../../../core/Engine';
import ToastService from '../../../../../core/ToastService';
import {
  clearPostTradeShareSession,
  getPostTradeShareSession,
} from '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/postTradeShareSession';
import { PerpsOrderViewSelectorsIDs } from '../../Perps.testIds';
import { fireImpact } from '../../../../../util/haptics';
import {
  usePerpsOrderExecution,
  usePerpsOrderValidation,
  usePerpsToasts,
} from '../../hooks';
import { usePerpsEstimatedSlippage } from '../../hooks/usePerpsEstimatedSlippage';
import { usePerpsMaxSlippage } from '../../hooks/usePerpsMaxSlippage';
import { usePerpsOrderContext } from '../../contexts/PerpsOrderContext';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '@metamask/perps-controller';
import { PERPS_ANALYTICS_SIZE_UNIT } from '../../constants/perpsAnalytics';
import PerpsOrderView from './PerpsOrderView';

describe('PerpsOrderView', () => {
  beforeEach(() => {
    setupPerpsOrderViewMocks();
  });

  describe('pay-token available balance', () => {
    const PAY_TOKEN = {
      address: '0xusdc',
      chainId: '0xa4b1',
      symbol: 'mUSD',
    };

    // `payToken.balanceUsd` is captured once when the token is selected, so it
    // reads 0 whenever the token's balance was not tracked yet. Sizing must use
    // the live wallet balance or the form shows $0 available until the next
    // quote refresh.
    it('caps sizing by the live wallet balance when the pay-token snapshot is stale at zero', async () => {
      mockUseTransactionPayToken.mockReturnValue({
        payToken: { ...PAY_TOKEN, balanceUsd: '0' },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('250.5');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      expect(mockProviderEffectiveAvailableBalance).toBe(250.5);
    });

    it('reports a genuinely empty pay token as zero available balance', async () => {
      mockUseTransactionPayToken.mockReturnValue({
        payToken: { ...PAY_TOKEN, balanceUsd: '120' },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('0');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      expect(mockProviderEffectiveAvailableBalance).toBe(0);
    });

    it('defers to the Perps balance while the pay token is still resolving', async () => {
      mockUseTransactionPayToken.mockReturnValue({
        payToken: undefined,
        setPayToken: jest.fn(),
        isNative: undefined,
      });
      setMockPayTokenAccountBalanceUsd('0');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      expect(mockProviderEffectiveAvailableBalance).toBeUndefined();
    });

    it('defers to the Perps balance when the Perps account is the payment method', async () => {
      mockUseTransactionPayToken.mockReturnValue({
        payToken: { ...PAY_TOKEN, balanceUsd: '0' },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('250');
      mockUseIsPerpsBalanceSelected.mockReturnValue(true);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      expect(mockProviderEffectiveAvailableBalance).toBeUndefined();
    });

    it('does not warn about insufficient margin when the stale snapshot reads zero but the wallet is funded', async () => {
      const { useInsufficientPayTokenBalanceAlert: mockInsufficientAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      const { useNoPayTokenQuotesAlert: mockNoQuotesAlert } = jest.requireMock(
        '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
      ) as { useNoPayTokenQuotesAlert: jest.Mock };
      mockInsufficientAlert.mockReturnValue([]);
      mockNoQuotesAlert.mockReturnValue([]);

      mockUseTransactionPayToken.mockReturnValue({
        payToken: { ...PAY_TOKEN, balanceUsd: '0' },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('999999999');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      const warningCalls = (
        mockCreateEventBuilder.mock.calls as unknown as [
          { category?: string },
        ][]
      ).filter((call, idx) => {
        if (call[0]?.category !== 'Perp Error') {
          return false;
        }
        const builder = mockCreateEventBuilder.mock.results[idx].value;
        return (builder.addProperties as jest.Mock).mock.calls.some(
          (c: [Record<string, unknown>]) => c[0]?.error_type === 'warning',
        );
      });

      expect(warningCalls).toHaveLength(0);
    });
  });

  describe('slippage block on submit', () => {
    beforeEach(() => {
      // Earlier tests in the file mutate shared mocks (order form, validation,
      // toasts, slippage hooks) without restoring them. Reset every mock the
      // block path reads so this suite is self-contained regardless of run order.
      (usePerpsEstimatedSlippage as jest.Mock).mockReturnValue({
        estimatedSlippageBps: null,
        isReady: false,
      });
      (usePerpsMaxSlippage as jest.Mock).mockReturnValue({
        maxSlippageBps: 300,
        maxSlippageSource: 'default',
        setMaxSlippage: jest.fn(),
      });
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '11',
          leverage: 3,
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
      (usePerpsOrderValidation as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        fieldIssues: [],
        isValidating: false,
        insufficientBalanceErrors: [],
        validateNow: jest.fn(),
      });
    });

    afterEach(() => {
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
    });

    // CV cannot reach onSubmit while the button is disabled, so this unit test covers the programmatic-submit rejection.
    it.each([
      { estimate: null, copyKey: 'perps.slippage.insufficient_depth' },
      { estimate: 100, copyKey: 'perps.slippage.cannot_fill_reduce_size' },
    ])(
      'rejects a programmatic submit before deposits with $copyKey',
      async ({ estimate, copyKey }) => {
        const mockPlaceOrder = jest.fn();
        (usePerpsOrderExecution as jest.Mock).mockReturnValue({
          placeOrder: mockPlaceOrder,
          isPlacing: false,
        });
        const toasts = mockDefaultUsePerpsToasts();
        (usePerpsToasts as jest.Mock).mockReturnValue(toasts);
        (usePerpsEstimatedSlippage as jest.Mock).mockReturnValue({
          estimatedSlippageBps: estimate,
          isReady: true,
          canFillWithinSlippage: false,
        });
        useTradeSheetRoute();
        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await act(async () => {
          await getMockTradeScreenProps().onSubmit();
        });

        expect(mockPlaceOrder).not.toHaveBeenCalled();
        expect(
          toasts.PerpsToastOptions.formValidation.orderForm.validationError,
        ).toHaveBeenCalledWith(copyKey);
        expect(toasts.showToast).toHaveBeenCalled();
      },
    );

    it.each([
      {
        surface: 'full-screen view',
        useTradeSheet: false,
        // The full-screen form has a slippage setting, so the copy may point
        // the user at the cap.
        expectedCopyKey: 'perps.slippage.exceeds_max',
      },
      {
        surface: 'Trade sheet',
        useTradeSheet: true,
        // The Trade sheet has no slippage control (product decision), so the
        // copy must only suggest reducing the order size.
        expectedCopyKey: 'perps.slippage.exceeds_max_reduce_size',
      },
    ])(
      'blocks placeOrder on the $surface when estimated slippage exceeds the configured cap',
      async ({ useTradeSheet, expectedCopyKey }) => {
        const mockPlaceOrder = jest.fn().mockResolvedValue({ success: true });
        (usePerpsOrderExecution as jest.Mock).mockImplementation(() => ({
          placeOrder: mockPlaceOrder,
          isPlacing: false,
        }));

        const mockValidationError = jest.fn(() => ({
          id: 'slippage-block-toast',
        }));
        const mockShowToast = jest.fn();
        (usePerpsToasts as jest.Mock).mockReturnValue({
          showToast: mockShowToast,
          PerpsToastOptions: {
            formValidation: {
              orderForm: {
                limitPriceRequired: {},
                validationError: mockValidationError,
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
              shared: { submitting: jest.fn() },
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

        (usePerpsEstimatedSlippage as jest.Mock).mockReturnValue({
          estimatedSlippageBps: 500, // 5%
          isReady: true,
        });
        (usePerpsMaxSlippage as jest.Mock).mockReturnValue({
          maxSlippageBps: 100, // 1% — estimate exceeds the cap
          maxSlippageSource: 'user_configured',
          setMaxSlippage: jest.fn(),
        });

        if (useTradeSheet) {
          useTradeSheetRoute();
        }
        render(<PerpsOrderView />, { wrapper: TestWrapper });

        await act(async () => {
          if (useTradeSheet) {
            await getMockTradeScreenProps().onSubmit();
          } else {
            const placeOrderButton = await screen.findByTestId(
              PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
            );
            fireEvent.press(placeOrderButton);
          }
        });

        // The critical AC invariant: an order whose estimated slippage exceeds
        // the configured cap must NOT reach the order execution path. (The
        // event payload is verified separately by the slippage recipe and the
        // `eventNames` constants tests.)
        expect(mockPlaceOrder).not.toHaveBeenCalled();
        expect(fireImpact).not.toHaveBeenCalled();
        // The i18n mock returns the key for untranslated strings, so the copy
        // choice per surface is observable through the toast argument.
        expect(mockValidationError).toHaveBeenCalledWith(expectedCopyKey);
        expect(mockShowToast).toHaveBeenCalledWith({
          id: 'slippage-block-toast',
        });
      },
    );

    it('submits with the refreshed Lite slippage cap', async () => {
      const mockExecuteOrder = jest
        .fn()
        .mockResolvedValue({ success: false, error: 'test' });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: mockExecuteOrder,
        isPlacing: false,
      });
      (usePerpsMaxSlippage as jest.Mock).mockReturnValue({
        maxSlippageBps: 100,
        maxSlippageSource: 'user_configured',
        setMaxSlippage: jest.fn(),
      });
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        ...defaultMockHooks.usePerpsOrderContext,
      });
      mockUseIsPerpsBalanceSelected.mockReturnValue(true);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const placeOrderButton = await screen.findByTestId(
        PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON,
      );
      await act(async () => {
        fireEvent.press(placeOrderButton);
      });

      await waitFor(() => {
        expect(mockExecuteOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            maxSlippageBps: 100,
          }),
        );
      });
    });
  });

  describe('transaction considered + trade quote received', () => {
    let captured: { eventName: unknown; props: Record<string, unknown> }[];

    beforeEach(() => {
      captured = [];
      setMockIsPayQuoteLoading(false);
      setMockPayTotals(undefined);
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
    });

    const eventsOf = (name: unknown) =>
      captured.filter((e) => e.eventName === name);

    it('emits PERPS_TRANSACTION_CONSIDERED once the filled order form settles (1s debounce)', () => {
      jest.useFakeTimers();
      const view = render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Nothing before the 1s debounce window elapses.
      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(
        eventsOf(MetaMetricsEvents.PERPS_TRANSACTION_CONSIDERED),
      ).toHaveLength(0);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      const considered = eventsOf(
        MetaMetricsEvents.PERPS_TRANSACTION_CONSIDERED,
      );
      expect(considered).toHaveLength(1);
      expect(considered[0].props).toEqual(
        expect.objectContaining({
          [PERPS_EVENT_PROPERTY.ORDER_CONTEXT]: 'trade',
          [PERPS_EVENT_PROPERTY.ACTION]:
            PERPS_EVENT_VALUE.ACTION.CREATE_POSITION,
          [PERPS_EVENT_PROPERTY.ORDER_SIZE]: 11,
          [PERPS_EVENT_PROPERTY.INPUT_METHOD]: 'default',
          [PERPS_EVENT_PROPERTY.ASSET]: 'ETH',
          [PERPS_EVENT_PROPERTY.DIRECTION]: PERPS_EVENT_VALUE.DIRECTION.LONG,
          [PERPS_EVENT_PROPERTY.ORDER_TYPE]: 'market',
          [PERPS_EVENT_PROPERTY.ORDER_HAS_TP]: false,
          [PERPS_EVENT_PROPERTY.ORDER_HAS_SL]: false,
          [PERPS_EVENT_PROPERTY.LEVERAGE]: 3,
          [PERPS_EVENT_PROPERTY.TRADE_WITH_TOKEN]: true,
          [PERPS_ANALYTICS_SIZE_UNIT]: 'usd',
        }),
      );

      setMockPerpsSizeDenomination('asset');
      act(() => {
        view.rerender(<PerpsOrderView />);
        jest.advanceTimersByTime(1000);
      });

      expect(
        eventsOf(MetaMetricsEvents.PERPS_TRANSACTION_CONSIDERED),
      ).toHaveLength(1);

      jest.useRealTimers();
    });

    // Full-screen vs Trade-sheet size_unit, including a saved coin unit before
    // the price can project it, is covered in PerpsOrderView.view.test.tsx
    // against the real sheet and settings store.

    it('emits PERPS_TRADE_QUOTE_RECEIVED with quote_latency_ms when a pay-token quote completes', () => {
      // Quote request in flight (custom pay token selected by default).
      setMockIsPayQuoteLoading(true);
      const { rerender } = render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Quote resolves: loading transitions true -> false with totals present.
      setMockIsPayQuoteLoading(false);
      setMockPayTotals({ fees: {} });
      act(() => {
        rerender(<PerpsOrderView />);
      });

      const quotes = eventsOf(MetaMetricsEvents.PERPS_TRADE_QUOTE_RECEIVED);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].props).toEqual(
        expect.objectContaining({
          [PERPS_EVENT_PROPERTY.ASSET]: 'ETH',
          [PERPS_EVENT_PROPERTY.STATUS]: PERPS_EVENT_VALUE.STATUS.SUCCESS,
          [PERPS_EVENT_PROPERTY.QUOTE_LATENCY_MS]: expect.any(Number),
        }),
      );
    });

    it('emits a distinct PERPS_TRADE_QUOTE_RECEIVED per failed attempt when the amount changes (same blocking alert)', () => {
      const { useNoPayTokenQuotesAlert: mockNoQuotes } = jest.requireMock(
        '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
      ) as { useNoPayTokenQuotesAlert: jest.Mock };
      // Same blocking no-quotes alert for both attempts; a failed quote carries
      // no payTotals, so only the amount distinguishes the two attempts.
      mockNoQuotes.mockReturnValue([
        { key: 'no_quotes', message: 'No quotes available', isBlocking: true },
      ]);

      try {
        const { rerender } = render(<PerpsOrderView />, {
          wrapper: TestWrapper,
        });

        // Second attempt: user edits the amount, same failing alert.
        (usePerpsOrderContext as jest.Mock).mockReturnValue({
          ...defaultMockHooks.usePerpsOrderContext,
          orderForm: {
            ...defaultMockHooks.usePerpsOrderContext.orderForm,
            amount: '22',
          },
        });
        act(() => {
          rerender(<PerpsOrderView />);
        });

        const quotes = eventsOf(MetaMetricsEvents.PERPS_TRADE_QUOTE_RECEIVED);
        expect(quotes).toHaveLength(2);
        quotes.forEach((q) =>
          expect(q.props).toEqual(
            expect.objectContaining({
              [PERPS_EVENT_PROPERTY.STATUS]: PERPS_EVENT_VALUE.STATUS.FAILED,
            }),
          ),
        );
      } finally {
        mockNoQuotes.mockReturnValue([]);
      }
    });
  });

  describe('abandon order tracking', () => {
    let captured: { eventName: unknown; props: Record<string, unknown> }[];

    const isAbandonEvent = (event: {
      eventName: unknown;
      props: Record<string, unknown>;
    }) =>
      event.eventName === MetaMetricsEvents.PERPS_UI_INTERACTION &&
      event.props?.[PERPS_EVENT_PROPERTY.ACTION] ===
        PERPS_EVENT_VALUE.ACTION.ABANDON_ORDER;

    const setupAbandonNav = (routes: { key: string }[]) => {
      const listeners: Record<string, (() => void)[]> = {};
      (useNavigation as jest.Mock).mockReturnValue({
        navigate: mockNavigate,
        goBack: mockGoBack,
        dispatch: jest.fn(),
        addListener: jest.fn((event: string, cb: () => void) => {
          (listeners[event] = listeners[event] || []).push(cb);
          return jest.fn();
        }),
        getState: jest.fn(() => ({ routes })),
        getParent: jest.fn(() => undefined),
      });
      return (event: string) => (listeners[event] || []).forEach((cb) => cb());
    };

    beforeEach(() => {
      captured = [];
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
    });

    it('emits abandon_order on beforeRemove (back / hardware back)', () => {
      const fire = setupAbandonNav([{ key: 'trade' }]);
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      act(() => fire('beforeRemove'));

      expect(captured.some(isAbandonEvent)).toBe(true);
    });

    it('emits abandon_order on tab-away (blur with unchanged depth)', () => {
      const fire = setupAbandonNav([{ key: 'trade' }]);
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      act(() => fire('blur'));

      expect(captured.some(isAbandonEvent)).toBe(true);
    });

    it('does NOT emit on blur when a child route was pushed (depth increased)', () => {
      const routes = [{ key: 'trade' }];
      const fire = setupAbandonNav(routes);
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      routes.push({ key: 'child' });
      act(() => fire('blur'));

      expect(captured.some(isAbandonEvent)).toBe(false);
    });

    // Note: committed-order suppression (hasPlacedOrderRef) is covered
    // deterministically by the usePerpsAbandonOrderTracking hook unit test and by
    // the PerpsClosePositionView "does NOT emit after a confirmed close"
    // integration test (which drives the real confirm button). Driving the full
    // place-order flow here is too dependent on cross-test mock state to assert
    // reliably.
  });

  describe('copy-trade intents', () => {
    const copyTradeOrigin = { commentId: 'comment-1', asset: 'ETH' };
    const mockMessengerCall = jest.mocked(Engine.controllerMessenger.call);

    const getOnSuccess = () => {
      const options = (usePerpsOrderExecution as jest.Mock).mock.calls.at(
        -1,
      )?.[0] as Parameters<typeof usePerpsOrderExecution>[0];
      if (!options?.onSuccess) {
        throw new Error('usePerpsOrderExecution was not given onSuccess');
      }
      return options.onSuccess;
    };

    const mockOrderSize = (amount: string, leverage = 3) => {
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        ...defaultMockHooks.usePerpsOrderContext,
        orderForm: {
          ...defaultMockHooks.usePerpsOrderContext.orderForm,
          amount,
          leverage,
        },
      });
    };

    beforeEach(() => {
      setMockSelectedEvmAccount({ address: '0xTRADER' });
      mockMessengerCall.mockResolvedValue({});
      clearPostTradeShareSession();
      mockOrderSize('100', 3);
    });

    afterEach(() => {
      clearPostTradeShareSession();
      ToastService.resetForTesting();
      mockCanShareCopyTrade.mockReturnValue(true);
      applyDefaultHookMocks();
    });

    it('posts a perps intent for the placed order on the copied market', async () => {
      (useRoute as jest.Mock).mockReturnValue({
        params: { asset: 'ETH', direction: 'long', copyTradeOrigin },
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        await getOnSuccess()(undefined, { success: true, orderId: '42' });
      });

      expect(mockMessengerCall).toHaveBeenCalledWith(
        'SocialService:createCopyTradeIntent',
        {
          origin: { kind: 'comment', id: 'comment-1' },
          copierAccount: { caip10: 'eip155:42161:0xTRADER' },
          execution: { product: 'perps', oid: '42' },
        },
      );
    });

    it('posts no intent for an order opened outside a social post', async () => {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        await getOnSuccess()(undefined, { success: true, orderId: '42' });
      });

      expect(mockMessengerCall).not.toHaveBeenCalled();
    });

    it('opens the share sheet for a copied market order and skips the success toast', async () => {
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      const placeOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
      });
      useTradeSheetRoute({
        stayOnCurrentScreen: true,
        copyTradeOrigin,
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      const pending = getPostTradeShareSession();
      expect(pending?.product).toBe('perps');
      expect(pending?.status).toBe('pending');
      expect(showToast).not.toHaveBeenCalled();

      await act(async () => {
        await getOnSuccess()(undefined, {
          success: true,
          orderId: '42',
          averagePrice: '3200',
        });
      });

      const completed = getPostTradeShareSession();
      expect(completed?.status).toBe('complete');
      if (completed?.product !== 'perps') {
        return;
      }
      expect(completed.orderId).toBe('42');
      expect(showToast).not.toHaveBeenCalled();
    });

    it('does not close any toast when a copied market order opens the share sheet outside a deposit', async () => {
      const closeToast = jest.fn();
      ToastService.toastRef = {
        current: { closeToast },
      } as unknown as typeof ToastService.toastRef;
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn().mockResolvedValue({ success: true }),
        isPlacing: false,
      });
      useTradeSheetRoute({
        stayOnCurrentScreen: true,
        copyTradeOrigin,
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(getPostTradeShareSession()?.status).toBe('pending');
      expect(closeToast).not.toHaveBeenCalled();
    });

    it('keeps the normal toasts for a copied market order below $10 position size', async () => {
      mockOrderSize('9', 10);
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn().mockResolvedValue({ success: true }),
        isPlacing: false,
      });
      useTradeSheetRoute({
        stayOnCurrentScreen: true,
        copyTradeOrigin,
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(getPostTradeShareSession()).toBeNull();
      expect(showToast).toHaveBeenCalled();
    });

    it('keeps the normal toasts for a copied market order from an account that cannot post', async () => {
      mockCanShareCopyTrade.mockReturnValue(false);
      mockResolvePostTradePrompt.mockReturnValue({ kind: 'none' });
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn().mockResolvedValue({ success: true }),
        isPlacing: false,
      });
      useTradeSheetRoute({
        stayOnCurrentScreen: true,
        copyTradeOrigin,
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(getPostTradeShareSession()).toBeNull();
      expect(showToast).toHaveBeenCalled();
    });

    it('marks the share sheet failed and skips the error toast', async () => {
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      const placeOrder = jest.fn().mockResolvedValue({ success: false });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
      });
      useTradeSheetRoute({
        stayOnCurrentScreen: true,
        copyTradeOrigin,
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      const options = (usePerpsOrderExecution as jest.Mock).mock.calls.at(
        -1,
      )?.[0] as Parameters<typeof usePerpsOrderExecution>[0];
      if (!options?.onError) {
        throw new Error('usePerpsOrderExecution was not given onError');
      }
      act(() => {
        options.onError?.({ error: 'rejected' });
      });

      expect(getPostTradeShareSession()?.status).toBe('failed');
      expect(showToast).not.toHaveBeenCalled();
    });

    it('keeps the submitted toast when the order is not a social copy-trade', async () => {
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      const placeOrder = jest.fn().mockResolvedValue({ success: true });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder,
        isPlacing: false,
      });
      useTradeSheetRoute();
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });

      expect(getPostTradeShareSession()).toBeNull();
      expect(showToast).toHaveBeenCalled();
    });

    it('completes the order success when the intent action is not registered', () => {
      mockMessengerCall.mockImplementation(() => {
        throw new Error(
          'A handler for SocialService:createCopyTradeIntent has not been registered',
        );
      });
      (useRoute as jest.Mock).mockReturnValue({
        params: { asset: 'ETH', direction: 'long', copyTradeOrigin },
      });
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(() =>
        getOnSuccess()(undefined, { success: true, orderId: '42' }),
      ).not.toThrow();
      expect(mockMessengerCall).toHaveBeenCalled();
    });
  });

  describe('post-trade prompt', () => {
    const { incrementShareSheetCount, markClaimSheetSeen } = jest.requireMock(
      '../../../../../util/social/postTradePromptStorage',
    );
    const { openPostTradeComposer } = jest.requireMock(
      '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/postTradeComposerParams',
    );
    const countKey = { address: '0xlinked', product: 'perps' };

    const getOnSuccess = () => {
      const options = (usePerpsOrderExecution as jest.Mock).mock.calls.at(
        -1,
      )?.[0] as Parameters<typeof usePerpsOrderExecution>[0];
      if (!options?.onSuccess) {
        throw new Error('usePerpsOrderExecution was not given onSuccess');
      }
      return options.onSuccess;
    };

    const mockOrderSize = (amount: string, leverage = 3) => {
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        ...defaultMockHooks.usePerpsOrderContext,
        orderForm: {
          ...defaultMockHooks.usePerpsOrderContext.orderForm,
          amount,
          leverage,
        },
      });
    };

    const submitOrder = async () => {
      const showToast = jest.fn();
      (usePerpsToasts as jest.Mock).mockReturnValue({
        ...mockDefaultUsePerpsToasts(),
        showToast,
      });
      (usePerpsOrderExecution as jest.Mock).mockReturnValue({
        placeOrder: jest.fn().mockResolvedValue({ success: true }),
        isPlacing: false,
      });
      useTradeSheetRoute({ stayOnCurrentScreen: true });
      render(<PerpsOrderView />, { wrapper: TestWrapper });
      await act(async () => {
        getMockTradeScreenProps().onSubmit();
      });
      showToast.mockClear();
      return showToast;
    };

    const fill = async (orderId: string | undefined = '42') => {
      await act(async () => {
        await getOnSuccess()(undefined, {
          success: true,
          orderId,
          averagePrice: '3200',
        });
      });
    };

    beforeEach(() => {
      clearPostTradeShareSession();
      setMockIsPerpsProModeActive(false);
      mockResolvePostTradePrompt.mockReturnValue({ kind: 'none' });
      mockOrderSize('100', 3);
    });

    afterEach(() => {
      clearPostTradeShareSession();
      applyDefaultHookMocks();
    });

    it('opens a counted share sheet for a Lite market order', async () => {
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'share_sheet',
        countKey,
      });

      const showToast = await submitOrder();

      expect(mockResolvePostTradePrompt).toHaveBeenCalledWith('perps');
      expect(getPostTradeShareSession()?.status).toBe('pending');

      await fill();

      expect(getPostTradeShareSession()?.status).toBe('complete');
      expect(incrementShareSheetCount).toHaveBeenCalledWith(
        '0xlinked',
        'perps',
      );
      expect(showToast).not.toHaveBeenCalled();
    });

    it('does not count a share sheet when the fill has no order id', async () => {
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'share_sheet',
        countKey,
      });

      const showToast = await submitOrder();
      await fill('');

      expect(incrementShareSheetCount).not.toHaveBeenCalled();
      expect(getPostTradeShareSession()).toBeNull();
      expect(showToast).toHaveBeenCalled();
    });

    it('opens a create profile sheet at submit and marks it seen on fill', async () => {
      mockResolvePostTradePrompt.mockReturnValue({ kind: 'claim_sheet' });

      const showToast = await submitOrder();

      expect(getPostTradeShareSession()).toEqual(
        expect.objectContaining({
          variant: 'create_profile',
          status: 'pending',
        }),
      );
      expect(markClaimSheetSeen).not.toHaveBeenCalled();

      await fill();

      expect(getPostTradeShareSession()?.status).toBe('complete');
      expect(markClaimSheetSeen).toHaveBeenCalledWith('perps');
      expect(showToast).not.toHaveBeenCalled();
    });

    it('does not mark the create profile sheet seen without an order id', async () => {
      mockResolvePostTradePrompt.mockReturnValue({ kind: 'claim_sheet' });

      await submitOrder();
      await fill('');

      expect(markClaimSheetSeen).not.toHaveBeenCalled();
    });

    it('adds Post to feed to the confirmed toast', async () => {
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'post_to_feed_toast',
      });

      const showToast = await submitOrder();
      await fill();

      const toast = showToast.mock.calls.at(-1)?.[0];
      expect(toast.linkButtonOptions.label).toBe(
        'social_leaderboard.post_trade_share.post_to_feed',
      );

      toast.linkButtonOptions.onPress();

      expect(openPostTradeComposer).toHaveBeenCalledWith(
        expect.objectContaining({
          tradeInFlight: expect.objectContaining({
            orderId: '42',
            chain: 'hyperliquid',
          }),
          preview: expect.objectContaining({ product: 'perps' }),
          shareId: 'share:42',
        }),
      );
    });

    it('skips the prompt in Pro mode', async () => {
      setMockIsPerpsProModeActive(true);
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'share_sheet',
        countKey,
      });

      await submitOrder();

      expect(mockResolvePostTradePrompt).not.toHaveBeenCalled();
      expect(getPostTradeShareSession()).toBeNull();
    });

    it('opens a share sheet when position size reaches $10 even though margin is below it', async () => {
      mockOrderSize('50', 10);
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'share_sheet',
        countKey,
      });

      await submitOrder();

      expect(getPostTradeShareSession()).toEqual(
        expect.objectContaining({ variant: 'share', status: 'pending' }),
      );
    });

    it('uses the normal toast for a share sheet when position size is below $10', async () => {
      mockOrderSize('9', 10);
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'share_sheet',
        countKey,
      });

      const showToast = await submitOrder();
      await fill();

      expect(getPostTradeShareSession()).toBeNull();
      expect(incrementShareSheetCount).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalled();
    });

    it('does not open create profile or mark it seen when position size is below $10', async () => {
      mockOrderSize('9', 10);
      mockResolvePostTradePrompt.mockReturnValue({ kind: 'claim_sheet' });

      const showToast = await submitOrder();
      await fill();

      expect(getPostTradeShareSession()).toBeNull();
      expect(markClaimSheetSeen).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalled();
    });

    it('uses the confirmed toast without Post to feed when position size is below $10', async () => {
      mockOrderSize('9', 10);
      mockResolvePostTradePrompt.mockReturnValue({
        kind: 'post_to_feed_toast',
      });

      const showToast = await submitOrder();
      await fill();

      expect(showToast).toHaveBeenCalled();
      expect(
        showToast.mock.calls.at(-1)?.[0]?.linkButtonOptions,
      ).toBeUndefined();
    });
  });
});
