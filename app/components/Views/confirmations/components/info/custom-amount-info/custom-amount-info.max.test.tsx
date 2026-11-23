import {
  createCustomAmountInfo,
  createCustomAmountMock,
  emitCount,
  emittedPayloadFor,
  mockRampsTrackEvent,
  mockToast,
  mockUseRampsUserRegion,
  render,
  setControllerTransactions,
  setupCustomAmountInfoMocks,
  useAccountNoFundsAlertMock,
  useAlertsMock,
  useConfirmActionsMock,
  useIsTransactionPayLoadingMock,
  useMoneyNoFeeTokensMock,
  useSnapAmountToMaxMock,
  useTransactionCustomAmountAlertsMock,
  useTransactionCustomAmountMock,
  useTransactionMetadataRequestMock,
  useTransactionPayAvailableTokensMock,
  useTransactionPayFiatPaymentMock,
  useTransactionPayQuotesLastUpdatedMock,
  useTransactionPayQuotesMock,
  useTransactionPayTokenMock,
} from './custom-amount-info.testUtils';
import { act } from 'react';
import { noop } from 'lodash';
import { Alert, Severity } from '../../../types/alerts';
import { AlertKeys } from '../../../constants/alerts';
import { AlertsContextParams } from '../../../context/alert-system-context';
import { useTransactionPayFiatPayment } from '../../../hooks/pay/useTransactionPayData';
import { strings } from '../../../../../../../locales/i18n';
import { getMoneyAccountDepositIntent } from '../../../../../UI/Money/hooks/useMoneyAccount';
import { fireEvent } from '@testing-library/react-native';
import { TransactionType } from '@metamask/transaction-controller';
import { ConfirmationFooterSelectorIDs } from '../../../ConfirmationView.testIds';
import { DepositPrefillStatus } from '../../../hooks/transactions/useDepositPrefillAmount';
import { MM_PAY_AMOUNT_INPUT_TYPE_MANUAL_SNAPPED_MAX } from '../../../hooks/custom-amount/useSnapAmountToMax';

describe('CustomAmountInfo', () => {
  beforeEach(() => {
    setupCustomAmountInfoMocks();
  });

  describe('hasMax percentage button', () => {
    beforeEach(() => {
      // Percentage buttons only render when hasInput is false.
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({ amountFiat: '0', hasInput: false }),
      );
    });

    it('renders Max when hasMax=true and pay token is non-native', () => {
      const { getByText, queryByText } = render({ hasMax: true });

      expect(getByText('Max')).toBeOnTheScreen();
      expect(queryByText('90%')).not.toBeOnTheScreen();
    });

    it('falls back to 90% when pay token is native and the flow is not a withdraw (safeguard against sending entire native balance with no gas reserve)', () => {
      useTransactionPayTokenMock.mockReturnValue({
        payToken: {
          address: '0x123',
          balanceHuman: '0',
          balanceFiat: '0',
          balanceRaw: '0',
          balanceUsd: '0',
          chainId: '0x1',
          decimals: 18,
          symbol: 'TST',
        },
        setPayToken: noop as never,
        isNative: true,
      });

      const { getByText, queryByText } = render({ hasMax: true });

      expect(getByText('90%')).toBeOnTheScreen();
      expect(queryByText('Max')).not.toBeOnTheScreen();
    });

    it.each([
      TransactionType.perpsWithdraw,
      TransactionType.predictWithdraw,
      TransactionType.moneyAccountWithdraw,
    ])(
      'renders Max for %s even with a native destination token (pay token is destination in post-quote mode, native-gas-reserve safeguard does not apply)',
      (transactionType) => {
        useTransactionMetadataRequestMock.mockReturnValue({
          type: transactionType,
          txParams: { from: '0x123' },
        } as never);
        useTransactionPayTokenMock.mockReturnValue({
          payToken: {
            address: '0x123',
            balanceHuman: '0',
            balanceFiat: '0',
            balanceRaw: '0',
            balanceUsd: '0',
            chainId: '0x1',
            decimals: 18,
            symbol: 'TST',
          },
          setPayToken: noop as never,
          isNative: true,
        });

        const { getByText, queryByText } = render({
          hasMax: true,
          transactionType,
        });

        expect(getByText('Max')).toBeOnTheScreen();
        expect(queryByText('90%')).not.toBeOnTheScreen();
      },
    );

    it('renders 90% when hasMax is not provided', () => {
      const { getByText, queryByText } = render();

      expect(getByText('90%')).toBeOnTheScreen();
      expect(queryByText('Max')).not.toBeOnTheScreen();
    });

    it('renders Max for money deposit when useMoneyNoFeeTokens returns true', () => {
      useMoneyNoFeeTokensMock.mockReturnValue({ isMoneyNoFeeToken: true });

      const { getByText, queryByText } = render();

      expect(getByText('Max')).toBeOnTheScreen();
      expect(queryByText('90%')).not.toBeOnTheScreen();
    });

    it('renders 90% for money deposit when useMoneyNoFeeTokens returns false', () => {
      useMoneyNoFeeTokensMock.mockReturnValue({ isMoneyNoFeeToken: false });

      const { getByText, queryByText } = render();

      expect(getByText('90%')).toBeOnTheScreen();
      expect(queryByText('Max')).not.toBeOnTheScreen();
    });

    it('falls back to 90% when useMoneyNoFeeTokens is true but pay token is native', () => {
      useMoneyNoFeeTokensMock.mockReturnValue({ isMoneyNoFeeToken: true });
      useTransactionPayTokenMock.mockReturnValue({
        payToken: {
          address: '0x123',
          balanceHuman: '0',
          balanceFiat: '0',
          balanceRaw: '0',
          balanceUsd: '0',
          chainId: '0x1',
          decimals: 18,
          symbol: 'ETH',
        },
        setPayToken: noop as never,
        isNative: true,
      });

      const { getByText, queryByText } = render();

      expect(getByText('90%')).toBeOnTheScreen();
      expect(queryByText('Max')).not.toBeOnTheScreen();
    });
  });

  describe('Max auto-submit', () => {
    const updateTokenAmountMock = jest.fn();
    const updatePendingAmountPercentageMock = jest.fn().mockReturnValue(true);

    beforeEach(() => {
      updatePendingAmountPercentageMock.mockReturnValue(true);
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '0',
          hasInput: false,
          updatePendingAmountPercentage: updatePendingAmountPercentageMock,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );
    });

    it('hides keyboard immediately when Max is pressed', async () => {
      const { getByText, queryByTestId } = render({ hasMax: true });

      expect(queryByTestId('deposit-keyboard')).toBeOnTheScreen();

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      expect(queryByTestId('deposit-keyboard')).toBeNull();
    });

    it('calls updatePendingAmountPercentage with 100 when Max is pressed', async () => {
      const { getByText } = render({ hasMax: true });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      expect(updatePendingAmountPercentageMock).toHaveBeenCalledWith(
        100,
        undefined,
      );
    });

    it('calls handleDone when amountFiat updates after Max press', async () => {
      const { getByText, rerender } = render({ hasMax: true });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          amountHuman: '0.05',
          hasInput: false,
          updatePendingAmountPercentage: updatePendingAmountPercentageMock,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      await act(async () => {
        rerender(createCustomAmountInfo({ hasMax: true }));
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('calls onAmountSubmit after Max auto-submit completes', async () => {
      const onAmountSubmitMock = jest.fn();
      const { getByText, rerender } = render({
        hasMax: true,
        onAmountSubmit: onAmountSubmitMock,
      });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          amountHuman: '0.05',
          hasInput: false,
          updatePendingAmountPercentage: updatePendingAmountPercentageMock,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      await act(async () => {
        rerender(
          createCustomAmountInfo({
            hasMax: true,
            onAmountSubmit: onAmountSubmitMock,
          }),
        );
      });

      expect(onAmountSubmitMock).toHaveBeenCalledTimes(1);
    });

    it('does not auto-submit for non-max percentages', async () => {
      const { getByText, queryByTestId } = render();

      await act(async () => {
        fireEvent.press(getByText('10%'));
      });

      expect(queryByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(updateTokenAmountMock).not.toHaveBeenCalled();
    });

    it('does not auto-submit when amountFiat stays at zero', async () => {
      const { getByText } = render({ hasMax: true });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      expect(updateTokenAmountMock).not.toHaveBeenCalled();
    });

    it('does not submit when there is no balance (Max returns false)', async () => {
      updatePendingAmountPercentageMock.mockReturnValue(false);

      const { getByText, queryByTestId } = render({ hasMax: true });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      // Keyboard stays open and the page never enters the loading/commit path.
      expect(queryByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(updateTokenAmountMock).not.toHaveBeenCalled();
    });

    it('auto-submits when Max leaves amountFiat unchanged (already at max)', async () => {
      // amountFiat is already the max (e.g. defaultAmount / prefill) while
      // percentage buttons are still shown. Max must commit via the Loading
      // stage transition, not wait for amountFiat to change.
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          amountHuman: '0.05',
          hasInput: false,
          updatePendingAmountPercentage: updatePendingAmountPercentageMock,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      const { getByText } = render({ hasMax: true });

      await act(async () => {
        fireEvent.press(getByText('Max'));
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('snap to Max on Done', () => {
    const updateTokenAmountMock = jest.fn();
    const updatePendingAmountPercentageMock = jest.fn();
    const isSnapToMaxMock = jest.fn();
    const resolveAmountFiatMock = jest.fn();

    beforeEach(() => {
      updatePendingAmountPercentageMock.mockReturnValue(true);
      isSnapToMaxMock.mockReturnValue(false);
      resolveAmountFiatMock.mockImplementation((amount: string) => amount);
      useSnapAmountToMaxMock.mockReturnValue({
        isSnapToMax: isSnapToMaxMock,
        resolveAmountFiat: resolveAmountFiatMock,
      });
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '2.28',
          amountFiatDebounced: '2.28',
          updatePendingAmountPercentage: updatePendingAmountPercentageMock,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );
    });

    async function pressDone(view: ReturnType<typeof render>) {
      await act(async () => {
        fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      });
    }

    it('commits the amount through the Max path when it matches the displayed balance', async () => {
      isSnapToMaxMock.mockReturnValue(true);

      const view = render({ hasMax: true });
      await pressDone(view);

      expect(isSnapToMaxMock).toHaveBeenCalledWith('2.28');
      expect(updatePendingAmountPercentageMock).toHaveBeenCalledWith(
        100,
        MM_PAY_AMOUNT_INPUT_TYPE_MANUAL_SNAPPED_MAX,
      );
      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('commits the typed amount when it does not match the displayed balance', async () => {
      const view = render({ hasMax: true });
      await pressDone(view);

      expect(updatePendingAmountPercentageMock).not.toHaveBeenCalled();
      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('enables snapping when Max is offered', () => {
      render({ hasMax: true });

      expect(useSnapAmountToMaxMock).toHaveBeenLastCalledWith({
        isMaxAvailable: true,
      });
    });

    it('disables snapping when Max is not offered', () => {
      render();

      expect(useSnapAmountToMaxMock).toHaveBeenLastCalledWith({
        isMaxAvailable: false,
      });
    });

    it('disables snapping for a native pay token on deposits', () => {
      useTransactionPayTokenMock.mockReturnValue({
        isNative: true,
        payToken: {
          address: '0x0000000000000000000000000000000000000000',
          balanceHuman: '0',
          balanceFiat: '0',
          balanceRaw: '0',
          balanceUsd: '0',
          chainId: '0x1',
          decimals: 18,
          symbol: 'ETH',
        },
        setPayToken: noop as never,
      });

      render({ hasMax: true });

      expect(useSnapAmountToMaxMock).toHaveBeenLastCalledWith({
        isMaxAvailable: false,
      });
    });

    it('disables snapping when a fiat payment method is selected', () => {
      useTransactionPayFiatPaymentMock.mockReturnValue({
        selectedPaymentMethodId: 'debit-card',
      } as ReturnType<typeof useTransactionPayFiatPayment>);

      render({ hasMax: true });

      expect(useSnapAmountToMaxMock).toHaveBeenLastCalledWith({
        isMaxAvailable: false,
      });
    });

    it('evaluates pending amount alerts against the resolved amount', () => {
      resolveAmountFiatMock.mockReturnValue('2.2895');

      render({ hasMax: true });

      expect(resolveAmountFiatMock).toHaveBeenCalledWith('2.28');
      expect(useTransactionCustomAmountAlertsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ pendingFiatAmount: '2.2895' }),
      );
    });
  });

  describe('showPaymentDetails', () => {
    async function pressDone(view: ReturnType<typeof render>) {
      await act(async () => {
        fireEvent.press(view.getByText(strings('confirm.edit_amount_done')));
      });

      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(createCustomAmountInfo());
      useIsTransactionPayLoadingMock.mockReturnValue(false);
      view.rerender(createCustomAmountInfo());
    }

    it('holds the loading review after commit until a quote signal settles it', async () => {
      const view = render();

      // Committing arms the loading override. Leaving loading is owned solely by
      // the stage hook's exit effect, which waits for a genuine quote signal —
      // it must NOT settle synchronously on commit, otherwise the skeleton would
      // flash to the review and back once the real fetch begins.
      await act(async () => {
        fireEvent.press(view.getByText(strings('confirm.edit_amount_done')));
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();

      // A fresh, non-empty quote settles the override into the populated review.
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      view.rerender(createCustomAmountInfo());

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).not.toBeDisabled();
    });

    it('hides fee rows when the fetch settled with no quotes', async () => {
      useTransactionPayQuotesMock.mockReturnValue([]);

      const view = render();
      await pressDone(view);

      expect(view.queryByTestId('bridge-fee-row')).toBeNull();
    });

    it('shows fee rows when quotes exist regardless of source amount', async () => {
      useTransactionPayQuotesMock.mockReturnValue([{} as never]);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);

      const view = render();
      await pressDone(view);

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
    });
  });

  // TRAM-3623 headless ramps funnel, driven by the real adapter + ramps hook.
  // The shared money-deposit screen mounts the funnel exactly ONCE. The adapter
  // owns screen-viewed/reactive/order-proposed/continue events; selector-opened
  // is called from fiat options via the ramps selector hook, so it must NOT fire
  // here. Payloads + dedupe are proven in useFiatFunnelMetrics.test.ts.
  describe('TRAM-3623 funnel', () => {
    function setMoneyFlow({
      withQuote = false,
      withQuoteError = false,
    }: { withQuote?: boolean; withQuoteError?: boolean } = {}) {
      useTransactionMetadataRequestMock.mockReturnValue({
        id: 'tx-1',
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);
      setControllerTransactions([{ id: 'tx-1' }]);
      useTransactionPayFiatPaymentMock.mockReturnValue({
        selectedPaymentMethodId: '/payments/debit-credit-card',
        amountFiat: '100',
        caipAssetId: 'eip155:1/slip44:60',
        ...(withQuote && {
          rampsQuote: {
            provider: '/providers/transak',
            quote: { amountIn: 100, amountOut: 0.05, totalFees: 5 },
          },
        }),
      } as never);
      if (withQuoteError) {
        useAlertsMock.mockReturnValue({
          ...useAlertsMock(),
          alerts: [
            { key: AlertKeys.NoPayTokenQuotes, message: 'No quotes' },
          ] as Alert[],
        } as AlertsContextParams);
      }
    }

    it('emits RAMPS_SCREEN_VIEWED with HEADLESS / money_account / region on mount', () => {
      setMoneyFlow();

      render({ transactionType: TransactionType.moneyAccountDeposit });

      expect(emittedPayloadFor('RAMPS_SCREEN_VIEWED')).toEqual({
        location: 'Amount Input',
        ramp_type: 'HEADLESS',
        ramp_surface: 'money_account',
        region: 'us-ca',
      });
    });

    it('falls back to an empty region when the user region is unavailable', () => {
      setMoneyFlow();
      mockUseRampsUserRegion.mockReturnValue({
        userRegion: null as never,
        setUserRegion: jest.fn(),
      });

      render({ transactionType: TransactionType.moneyAccountDeposit });

      expect(emittedPayloadFor('RAMPS_SCREEN_VIEWED')).toEqual(
        expect.objectContaining({ region: '' }),
      );
    });

    it('does not fire RAMPS_ORDER_PROPOSED and shows toast when applying the amount throws on Done', async () => {
      setMoneyFlow();
      const error = new Error('update failed');
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          updateTokenAmount: jest.fn().mockRejectedValue(error),
        }),
      );

      const { getByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      // The Done handler's catch shows a toast and returns early without committing.
      expect(emittedPayloadFor('RAMPS_ORDER_PROPOSED')).toBeUndefined();
      expect(mockToast).toHaveBeenCalledTimes(1);
    });

    // Regression guard for FIX 2 (no double emission). Renders the REAL money
    // flow (no mock hiding the adapter/hook) and asserts EXACT call counts: the
    // single funnel mount fires each of its events exactly once.
    it('fires every money funnel event exactly once (no double emission)', async () => {
      setMoneyFlow({ withQuote: true, withQuoteError: true });
      useConfirmActionsMock.mockReturnValue({
        onConfirm: jest.fn(),
        onReject: jest.fn(),
      });

      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(view.getByText(strings('confirm.edit_amount_done')));
      });
      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );
      useIsTransactionPayLoadingMock.mockReturnValue(false);
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );
      await act(async () => {
        fireEvent.press(
          view.getByText(
            strings('confirm.deposit_edit_amount_convert_token', {
              symbol: 'TST',
            }),
          ),
        );
      });

      // Mount-time screen-viewed + three reactive + two imperative CTA events,
      // each exactly once from the single funnel mount.
      expect(emitCount('RAMPS_SCREEN_VIEWED')).toBe(1);
      expect(emitCount('RAMPS_PAYMENT_METHOD_SELECTED')).toBe(1);
      expect(emitCount('RAMPS_ORDER_SELECTED')).toBe(1);
      expect(emitCount('RAMPS_QUOTE_ERROR')).toBe(1);
      expect(emitCount('RAMPS_ORDER_PROPOSED')).toBe(1);
      expect(emitCount('RAMPS_CONTINUE_BUTTON_CLICKED')).toBe(1);
      // selector-opened is called from fiat options, so not emitted here.
      expect(emitCount('RAMPS_PAYMENT_METHOD_SELECTOR_CLICKED')).toBe(0);
      // The adapter threaded the money surface through (payload proven elsewhere).
      expect(emittedPayloadFor('RAMPS_ORDER_PROPOSED')).toEqual(
        expect.objectContaining({ ramp_surface: 'money_account' }),
      );
    });

    // Money-account deposit is the only wired surface; perps / prediction /
    // withdraw render this shared screen but resolve to an undefined
    // surface, so the funnel stays inert (reverts FIX 1).
    it.each([
      TransactionType.perpsDeposit,
      TransactionType.predictDeposit,
      TransactionType.moneyAccountWithdraw,
    ])('fires no RAMPS funnel events for %s on Done', async (type) => {
      useTransactionMetadataRequestMock.mockReturnValue({
        id: 'tx-1',
        type,
        txParams: { from: '0x123' },
      } as never);

      const { getByText } = render({ transactionType: type });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(mockRampsTrackEvent).not.toHaveBeenCalled();
    });
  });

  describe('prefill auto-submit', () => {
    it('prepares a nonzero initial amount once when its payment token becomes ready', async () => {
      const updateTokenAmount = jest.fn().mockResolvedValue(undefined);
      const onAmountSubmit = jest.fn();
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '5',
          depositPrefillStatus: DepositPrefillStatus.Loading,
          updateTokenAmount,
        }),
      );
      const props = {
        transactionType: TransactionType.moneyAccountDeposit,
        onAmountSubmit,
      };
      const { rerender } = render(props);
      expect(updateTokenAmount).not.toHaveBeenCalled();

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '5',
          depositPrefillStatus: DepositPrefillStatus.Prefilled,
          updateTokenAmount,
        }),
      );
      await act(async () => {
        rerender(createCustomAmountInfo(props));
      });
      await act(async () => {
        rerender(createCustomAmountInfo(props));
      });

      expect(updateTokenAmount).toHaveBeenCalledTimes(1);
      expect(onAmountSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls handleDone when isPrefillPending transitions to false', async () => {
      const updateTokenAmountMock = jest.fn();
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          isPrefillPending: true,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      const { rerender } = render();

      expect(updateTokenAmountMock).not.toHaveBeenCalled();

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          isPrefillPending: false,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      await act(async () => {
        rerender(createCustomAmountInfo());
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('auto-submits when prefill is ready and keyboard is hidden', async () => {
      const updateTokenAmountMock = jest.fn();
      const onAmountSubmitMock = jest.fn();
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '100',
          depositPrefillStatus: DepositPrefillStatus.Prefilled,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      render({ onAmountSubmit: onAmountSubmitMock });
      await act(async () => {
        await Promise.resolve();
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
      expect(onAmountSubmitMock).toHaveBeenCalledTimes(1);
    });

    it('does not auto-submit while the keyboard is visible', () => {
      const updateTokenAmountMock = jest.fn();
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '100',
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      render();

      expect(updateTokenAmountMock).not.toHaveBeenCalled();
    });

    // Regression: a prefill is skipped for the frames where the pay token and
    // its balance are still resolving, which opens the keypad. The resolved
    // prefill then stayed stranded on the keypad instead of advancing to the
    // quote, because an open keypad was read as the user editing.
    async function renderReleasedPrefillSkip({
      hasUserEditedAmountRef,
      updateTokenAmount,
    }: {
      hasUserEditedAmountRef: { current: boolean };
      updateTokenAmount: jest.Mock;
    }) {
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '0',
          hasInput: false,
          depositPrefillStatus: DepositPrefillStatus.Skipped,
          hasUserEditedAmountRef,
          updateTokenAmount,
        }),
      );

      const { rerender } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          depositPrefillStatus: DepositPrefillStatus.Prefilled,
          hasUserEditedAmountRef,
          updateTokenAmount,
        }),
      );

      await act(async () => {
        rerender(
          createCustomAmountInfo({
            transactionType: TransactionType.moneyAccountDeposit,
          }),
        );
      });
    }

    it('auto-submits when a transiently skipped prefill later resolves', async () => {
      const updateTokenAmountMock = jest.fn();

      await renderReleasedPrefillSkip({
        hasUserEditedAmountRef: { current: false },
        updateTokenAmount: updateTokenAmountMock,
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('does not auto-submit a released prefill skip once the user has typed', async () => {
      const updateTokenAmountMock = jest.fn();

      await renderReleasedPrefillSkip({
        hasUserEditedAmountRef: { current: true },
        updateTokenAmount: updateTokenAmountMock,
      });

      expect(updateTokenAmountMock).not.toHaveBeenCalled();
    });

    // Regression: a prefilled amount is shown long before its quote arrives.
    // Tapping it opened the keypad, but a prefill that landed or re-ran a frame
    // later auto-submitted it closed again, so the amount looked unresponsive
    // until quotes settled.
    it('keeps the keypad open when a prefill re-runs after the user taps the amount', async () => {
      const updateTokenAmountMock = jest.fn();

      const rerenderWithStatus = async (
        view: ReturnType<typeof render>,
        status: DepositPrefillStatus,
      ) => {
        useTransactionCustomAmountMock.mockReturnValue(
          createCustomAmountMock({
            amountFiat: '50',
            depositPrefillStatus: status,
            updateTokenAmount: updateTokenAmountMock,
          }),
        );

        await act(async () => {
          view.rerender(
            createCustomAmountInfo({
              transactionType: TransactionType.moneyAccountDeposit,
            }),
          );
        });
      };

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '0',
          hasInput: false,
          depositPrefillStatus: DepositPrefillStatus.Skipped,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      // The prefill resolves and auto-submits the amount the user never touched.
      await rerenderWithStatus(view, DepositPrefillStatus.Prefilled);

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId('deposit-keyboard')).toBeNull();

      // User taps the amount to edit it while the quote is still loading.
      await act(async () => {
        fireEvent.press(view.getByTestId('custom-amount-input'));
      });

      expect(view.getByTestId('deposit-keyboard')).toBeOnTheScreen();

      // Pay token churn re-runs the prefill underneath the open keypad.
      await rerenderWithStatus(view, DepositPrefillStatus.Skipped);
      await rerenderWithStatus(view, DepositPrefillStatus.Prefilled);

      expect(view.getByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    });

    it('does not auto-submit a pending prefill once the user has tapped the amount', async () => {
      const updateTokenAmountMock = jest.fn();
      (getMoneyAccountDepositIntent as jest.Mock).mockReturnValue('addMusd');
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        batchId: '0xbatch',
        txParams: { from: '0x123' },
      } as never);
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          isPrefillPending: true,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(view.getByTestId('custom-amount-skeleton'));
      });

      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '50',
          isPrefillPending: false,
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      await act(async () => {
        view.rerender(
          createCustomAmountInfo({
            transactionType: TransactionType.moneyAccountDeposit,
          }),
        );
      });

      expect(updateTokenAmountMock).not.toHaveBeenCalled();
      expect(view.getByTestId('deposit-keyboard')).toBeOnTheScreen();
    });

    it('does not duplicate handleDone when user taps Done with a pending prefill', async () => {
      const updateTokenAmountMock = jest.fn();
      const onAmountSubmitMock = jest.fn();
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '100',
          updateTokenAmount: updateTokenAmountMock,
        }),
      );

      const { getByText } = render({ onAmountSubmit: onAmountSubmitMock });

      // Keyboard is visible → auto-submit blocked
      expect(updateTokenAmountMock).not.toHaveBeenCalled();

      // User taps Done → handleDone fires, keyboard hides, effect re-runs
      // but hasAutoSubmittedPrefill is now true so no second invocation.
      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
      expect(onAmountSubmitMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('deposit prefill status', () => {
    function setupDepositPrefill(
      status: DepositPrefillStatus = DepositPrefillStatus.Loading,
    ) {
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '0',
          hasInput: false,
          depositPrefillStatus: status,
        }),
      );
    }

    it('shows keyboard when autoSelectFiatPayment is true and deposit prefill is enabled', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);

      const { getByTestId } = render({ autoSelectFiatPayment: true });

      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
    });

    it('shows keyboard when fiat payment is selected with no pay token', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);
      useTransactionPayTokenMock.mockReturnValue({
        payToken: undefined,
        setPayToken: noop as never,
      });
      useTransactionPayFiatPaymentMock.mockReturnValue({
        selectedPaymentMethodId: 'pm-apple-pay',
      } as never);

      const { getByTestId } = render();

      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
    });

    it('shows keyboard when no tokens are available and no pay token is set', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);
      useTransactionPayTokenMock.mockReturnValue({
        payToken: undefined,
        setPayToken: noop as never,
      });
      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });
      useAccountNoFundsAlertMock.mockReturnValue([
        {
          key: AlertKeys.AccountNoFunds,
          title: 'No funds',
          message: 'No funds',
          severity: Severity.Danger,
          isBlocking: true,
        },
      ]);

      const { getByTestId } = render();

      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
    });

    it('does not show amount skeleton when fiat auto-selection skips prefill', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);

      const { queryByTestId, getByTestId } = render({
        autoSelectFiatPayment: true,
      });

      expect(queryByTestId('custom-amount-skeleton')).toBeNull();
      expect(getByTestId('custom-amount-input')).toBeOnTheScreen();
    });

    it('does not show amount skeleton when no tokens skips prefill', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);
      useTransactionPayTokenMock.mockReturnValue({
        payToken: undefined,
        setPayToken: noop as never,
      });
      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });
      useAccountNoFundsAlertMock.mockReturnValue([
        {
          key: AlertKeys.AccountNoFunds,
          title: 'No funds',
          message: 'No funds',
          severity: Severity.Danger,
          isBlocking: true,
        },
      ]);

      const { queryByTestId, getByTestId } = render();

      expect(queryByTestId('custom-amount-skeleton')).toBeNull();
      expect(getByTestId('custom-amount-input')).toBeOnTheScreen();
    });

    it('opens the keyboard when the loading amount skeleton is pressed', () => {
      // Escape hatch: a prefill that never resolves must not strand the user.
      setupDepositPrefill();

      const { getByTestId, queryByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      fireEvent.press(getByTestId('custom-amount-skeleton'));

      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(queryByTestId('custom-amount-skeleton')).toBeNull();
      expect(getByTestId('custom-amount-input')).toBeOnTheScreen();
    });

    it('shows amount skeleton while tokens have not loaded yet and prefill is enabled', () => {
      setupDepositPrefill();
      useTransactionPayTokenMock.mockReturnValue({
        payToken: undefined,
        setPayToken: noop as never,
      });
      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });

      const { getByTestId, queryByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(getByTestId('custom-amount-skeleton')).toBeOnTheScreen();
      expect(queryByTestId('custom-amount-input')).toBeNull();
    });

    it('shows the zero amount and keyboard when the pay token has no balance', () => {
      setupDepositPrefill(DepositPrefillStatus.Skipped);

      const { getByTestId, queryByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(queryByTestId('custom-amount-skeleton')).toBeNull();
      expect(getByTestId('custom-amount-input')).toBeOnTheScreen();
      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
    });

    it('shows the zero amount and keeps it pressable after prefill finishes with no value', () => {
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '0',
          hasInput: false,
          depositPrefillStatus: DepositPrefillStatus.Prefilled,
        }),
      );

      const { getByTestId, queryByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(queryByTestId('custom-amount-skeleton')).toBeNull();
      expect(getByTestId('custom-amount-input')).toBeOnTheScreen();
      expect(getByTestId('custom-amount-input')).toHaveProp(
        'accessibilityRole',
        'button',
      );
    });

    it('hides keyboard when deposit prefill is enabled and tokens are available', () => {
      setupDepositPrefill();

      const { queryByTestId } = render();

      expect(queryByTestId('deposit-keyboard')).toBeNull();
    });
  });
});
