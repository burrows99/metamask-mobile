import {
  MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
  createCustomAmountInfo,
  createCustomAmountMock,
  createDeferredPromise,
  render,
  setControllerTransactions,
  setupCustomAmountInfoMocks,
  useAccountNoFundsAlertMock,
  useClearConfirmationOnBackSwipeMock,
  useIsTransactionPayLoadingMock,
  usePayWithMoneyAccountSectionMock,
  useRouteMock,
  useTransactionAccountOverrideMock,
  useTransactionCustomAmountAlertsMock,
  useTransactionCustomAmountMock,
  useTransactionMetadataRequestMock,
  useTransactionPayAccountLoadingMock,
  useTransactionPayAvailableTokensMock,
  useTransactionPayFiatPaymentMock,
  useTransactionPayPrimaryRequiredTokenMock,
  useTransactionPayQuotesLastUpdatedMock,
  useTransactionPayQuotesMock,
} from './custom-amount-info.testUtils';
import React, { act } from 'react';
import { merge } from 'lodash';
import renderWithProvider from '../../../../../../util/test/renderWithProvider';
import {
  CustomAmountInfoProps,
  AdvancedCustomAmountInfoSkeleton,
  CustomAmountInfoSkeleton,
  PrefillCustomAmountInfoSkeleton,
} from './custom-amount-info';
import { simpleSendTransactionControllerMock } from '../../../__mocks__/controllers/transaction-controller-mock';
import { transactionApprovalControllerMock } from '../../../__mocks__/controllers/approval-controller-mock';
import { otherControllersMock } from '../../../__mocks__/controllers/other-controllers-mock';
import { Severity } from '../../../types/alerts';
import { AlertKeys } from '../../../constants/alerts';
import { useTransactionPayPrimaryRequiredToken } from '../../../hooks/pay/useTransactionPayData';
import { strings } from '../../../../../../../locales/i18n';
import { useRoute } from '@react-navigation/native';
import { getMoneyAccountDepositIntent } from '../../../../../UI/Money/hooks/useMoneyAccount';
import { fireEvent, within } from '@testing-library/react-native';
import { KeypadTestIds } from '../../../../../Base/Keypad/Keypad.testIds';
import { Platform } from 'react-native';
import { TransactionType } from '@metamask/transaction-controller';
import { CustomAmountInfoTestIds } from './custom-amount-info.testIds';
import {
  ConfirmationFooterSelectorIDs,
  TransactionPayComponentIDs,
} from '../../../ConfirmationView.testIds';
import { useTransactionMetadataRequest } from '../../../hooks/transactions/useTransactionMetadataRequest';
import { useAutomaticTransactionPayToken } from '../../../hooks/pay/useAutomaticTransactionPayToken';
import { ConfirmationFirstFrameProvider } from '../../../context/confirmation-first-frame-context';
import { DepositPrefillStatus } from '../../../hooks/transactions/useDepositPrefillAmount';
import { useTransactionPayMetrics } from '../../../hooks/pay/useTransactionPayMetrics';
import { useTransactionPayPostQuote } from '../../../hooks/pay/useTransactionPayPostQuote';
import { BalanceProjection } from '../../../../../UI/Money/components/BalanceProjection';
import useMMPayNavigation from '../../../hooks/ui/useMMPayNavigation';

describe('CustomAmountInfo', () => {
  beforeEach(() => {
    setupCustomAmountInfoMocks();
  });

  describe('first-frame deferral', () => {
    let frames: FrameRequestCallback[];

    beforeEach(() => {
      frames = [];
      jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(jest.fn());
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function createDeferredCustomAmountInfo(
      props: CustomAmountInfoProps = {},
      transactionId = 'transaction-1',
    ) {
      return (
        <ConfirmationFirstFrameProvider enabled transactionId={transactionId}>
          {createCustomAmountInfo(props)}
        </ConfirmationFirstFrameProvider>
      );
    }

    function renderDeferred(props: CustomAmountInfoProps = {}) {
      return renderWithProvider(createDeferredCustomAmountInfo(props), {
        state: merge(
          {},
          simpleSendTransactionControllerMock,
          transactionApprovalControllerMock,
          otherControllersMock,
        ),
      });
    }

    function completeFirstFrame() {
      act(() => frames[0](16));
      act(() => frames[1](32));
    }

    it('initializes immediately without a first-frame provider', () => {
      render();

      expect(useAutomaticTransactionPayToken).toHaveBeenCalled();
      expect(useTransactionPayMetrics).toHaveBeenCalled();
      expect(useTransactionPayPostQuote).toHaveBeenCalled();
      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('renders the live amount, keyboard and account selector on the first frame', () => {
      const { getByRole, getByTestId } = renderDeferred({
        supportAccountSelection: true,
      });

      expect(getByRole('button', { name: '$123.45' })).toBeOnTheScreen();
      expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(getByTestId('pay-account-selector')).toBeOnTheScreen();
      expect(useTransactionPayPostQuote).not.toHaveBeenCalled();
      expect(useTransactionCustomAmountMock).toHaveBeenCalled();
      expect(useClearConfirmationOnBackSwipeMock).toHaveBeenCalled();
    });

    it('defers automatic pay token selection and metrics until after the first frame', () => {
      renderDeferred({ disablePay: true });

      expect(useTransactionPayPostQuote).not.toHaveBeenCalled();

      act(() => frames[0](16));

      expect(useAutomaticTransactionPayToken).not.toHaveBeenCalled();
      expect(useTransactionPayMetrics).not.toHaveBeenCalled();
      expect(useTransactionPayPostQuote).not.toHaveBeenCalled();

      act(() => frames[1](32));

      expect(useAutomaticTransactionPayToken).toHaveBeenCalledWith(
        expect.objectContaining({ disable: true }),
      );
      expect(useTransactionPayMetrics).toHaveBeenCalled();
      expect(useTransactionPayPostQuote).toHaveBeenCalled();
    });

    it('does not start deferred initialization after dismissal during the frame yield', () => {
      const { unmount } = renderDeferred();
      act(() => frames[0](16));

      unmount();
      act(() => frames[1](32));

      expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
      expect(useAutomaticTransactionPayToken).not.toHaveBeenCalled();
    });

    it('defers initialization again when a different transaction replaces a ready one', () => {
      const { rerender } = renderDeferred();
      completeFirstFrame();
      jest.mocked(useAutomaticTransactionPayToken).mockClear();

      rerender(createDeferredCustomAmountInfo({}, 'next-transaction'));

      expect(useAutomaticTransactionPayToken).not.toHaveBeenCalled();
    });
  });

  it('renders amount', () => {
    const { getByTestId } = render();

    expect(
      getByTestId(TransactionPayComponentIDs.AMOUNT_VALUE),
    ).toHaveTextContent('123.45');
  });

  it('shows membership payment coverage instead of the Money balance projection', () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
      txParams: { from: '0x123' },
    } as ReturnType<typeof useTransactionMetadataRequest>);

    const { getByTestId } = render({
      transactionType: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
    });

    expect(
      within(getByTestId(CustomAmountInfoTestIds.BOTTOM_BLOCK)).getByText(
        'We’ll add $123.45 to your Money account to cover this payment.',
      ),
    ).toBeOnTheScreen();
    expect(BalanceProjection).not.toHaveBeenCalled();
  });

  it('keeps the balance projection for regular Money deposits', () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: TransactionType.moneyAccountDeposit,
      txParams: { from: '0x123' },
    } as ReturnType<typeof useTransactionMetadataRequest>);

    const { queryByTestId } = render({
      transactionType: TransactionType.moneyAccountDeposit,
    });

    expect(queryByTestId('membership-info-banner')).toBeNull();
    expect(BalanceProjection).toHaveBeenCalledWith(
      expect.objectContaining({ amountFiat: '123.45', projectedYears: 1 }),
      undefined,
    );
  });

  it('can prepare a fixed membership amount without displaying the keypad', async () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
      txParams: { from: '0x123' },
    } as ReturnType<typeof useTransactionMetadataRequest>);
    const updateTokenAmount = jest.fn().mockResolvedValue(undefined);
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({
        amountFiat: '1',
        depositPrefillStatus: DepositPrefillStatus.Skipped,
        updateTokenAmount,
      }),
    );
    const { getByTestId, queryByTestId } = render({
      transactionType: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
    });

    await act(async () => {
      fireEvent.press(getByTestId('membership-top-up-prepare-button'));
    });

    expect(updateTokenAmount).toHaveBeenCalledTimes(1);
    expect(queryByTestId(KeypadTestIds.DELETE_BUTTON)).toBeNull();
    expect(getByTestId('custom-amount-input').props.onPress).toBeUndefined();
  });

  it.each([
    DepositPrefillStatus.Disabled,
    DepositPrefillStatus.Skipped,
    DepositPrefillStatus.Prefilled,
  ])(
    'does not expose membership amount entry when prefill is %s',
    (depositPrefillStatus) => {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
        txParams: { from: '0x123' },
      } as ReturnType<typeof useTransactionMetadataRequest>);
      useRouteMock.mockReturnValue({
        key: 'membership',
        name: 'ConfirmationRequestModal',
        params: {
          amount: '1',
        },
      });
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          amountFiat: '1',
          depositPrefillStatus,
        }),
      );

      const { getByTestId, queryByTestId } = render({
        transactionType: MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE,
      });
      fireEvent.press(getByTestId('custom-amount-input'));

      expect(getByTestId('custom-amount-input').props.onPress).toBeUndefined();
      expect(queryByTestId('custom-amount-cursor')).toBeNull();
      expect(queryByTestId(KeypadTestIds.DELETE_BUTTON)).toBeNull();
      expect(useMMPayNavigation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        true,
      );
    },
  );

  it('renders payment token', () => {
    const { getByText } = render();
    expect(getByText('0 TST')).toBeDefined();
  });

  it('edits the keypad from the truncated amount rather than the full-precision one', () => {
    // Regression: Max stores the exact balance, so feeding the raw value to
    // the keypad left hidden decimals that had to be backspaced away one at a
    // time before the displayed amount changed.
    const updatePendingAmount = jest.fn();
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({
        amountFiat: '50.389',
        updatePendingAmount,
      }),
    );

    const { getByTestId } = render();

    expect(
      getByTestId(TransactionPayComponentIDs.AMOUNT_VALUE),
    ).toHaveTextContent('50.38');

    fireEvent.press(getByTestId(KeypadTestIds.DELETE_BUTTON));

    expect(updatePendingAmount).toHaveBeenCalledWith('50.3');
  });

  it('sets up back swipe rejection', () => {
    render();

    expect(useClearConfirmationOnBackSwipeMock).toHaveBeenCalledTimes(1);
  });

  it('does not render payment token if disablePay', () => {
    const { queryByText } = render({ disablePay: true });
    expect(queryByText('TST')).toBeNull();
  });

  it('settles a disablePay withdraw to an enabled review with no quote and no resolved amount', async () => {
    // Regression (device deadlock): a direct withdraw (disablePay) has no pay
    // token, never fetches a quote, and its required-token amount can fail to
    // resolve, so the stage settled on neither quote nor amount and stuck in
    // Loading with Confirm disabled ("confirm-button still not enabled").
    const deferred = createDeferredPromise();
    const updateTokenAmount = jest.fn(() => deferred.promise);
    useTransactionMetadataRequestMock.mockReturnValue({
      id: 'withdraw-tx-id',
      type: TransactionType.predictWithdraw,
      txParams: { from: '0x123' },
    } as never);
    setControllerTransactions([{ id: 'withdraw-tx-id' }]);
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({ updateTokenAmount }),
    );
    // No quotes for a direct transfer, and the required-token amount never
    // resolves (missing fiat rate on device), so hasAmount stays false. The
    // Loading override must still settle purely because disablePay is set.
    useTransactionPayQuotesMock.mockReturnValue([]);
    useTransactionPayQuotesLastUpdatedMock.mockReturnValue(undefined);
    useTransactionPayPrimaryRequiredTokenMock.mockReturnValue(
      undefined as unknown as ReturnType<
        typeof useTransactionPayPrimaryRequiredToken
      >,
    );

    const view = render({
      disablePay: true,
      transactionType: TransactionType.predictWithdraw,
    });

    // Commit the amount. No quote and no resolved required-token amount ever
    // arrive afterwards — the stage must still settle out of Loading.
    await act(async () => {
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      deferred.resolve();
      await deferred.promise;
    });

    expect(view.getByTestId('total-row')).toBeOnTheScreen();
    expect(view.queryByTestId('total-row-skeleton')).not.toBeOnTheScreen();
    expect(
      view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
    ).not.toBeDisabled();
  });

  it('renders the alert under the amount when a blocking error is present', () => {
    useTransactionCustomAmountAlertsMock.mockReturnValue({
      alertMessage: 'Test Help Text',
    });

    const { getByTestId, getByText } = render();

    expect(getByTestId('alert-message-banner')).toBeOnTheScreen();
    expect(getByText('Test Help Text')).toBeDefined();
  });

  it('renders keyboard instead of the loading review while an empty perps deposit is loading', () => {
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({
        amountFiat: '0',
        hasInput: false,
      }),
    );
    useIsTransactionPayLoadingMock.mockReturnValue(true);

    const { getByTestId, queryByTestId } = render({
      transactionType: TransactionType.perpsDeposit,
    });

    expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
    expect(queryByTestId('bridge-fee-row-skeleton')).not.toBeOnTheScreen();
    expect(queryByTestId('bridge-time-row-skeleton')).not.toBeOnTheScreen();
    expect(queryByTestId('total-row-skeleton')).not.toBeOnTheScreen();
  });

  describe('bottomBlock', () => {
    const originalPlatformOS = Platform.OS;

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', {
        value: originalPlatformOS,
        writable: true,
      });
    });

    it.each(['android', 'ios'])(
      'applies 16dp paddingBottom to the bottom block on %s',
      (platformOS) => {
        Object.defineProperty(Platform, 'OS', {
          value: platformOS,
          writable: true,
        });

        const { getByTestId } = render();

        expect(getByTestId(CustomAmountInfoTestIds.BOTTOM_BLOCK)).toHaveStyle({
          paddingBottom: 16,
        });
      },
    );
  });

  it('renders footerText when passed in', () => {
    const hint = 'Test footer text';
    const { getByText } = render({ footerText: hint });

    expect(getByText(hint)).toBeOnTheScreen();
  });

  it('does not render footerText when not passed in', () => {
    const hint = 'Test footer text';
    const { queryByText } = render();

    expect(queryByText(hint)).toBeNull();
  });

  it('renders buy button if no available tokens', () => {
    useTransactionPayAvailableTokensMock.mockReturnValue({
      availableTokens: [],
      hasTokens: false,
    });

    const { getByText } = render();

    expect(
      getByText(strings('confirm.custom_amount.buy_button')),
    ).toBeDefined();
  });

  it('does not render buy button when money account is available', () => {
    useTransactionPayAvailableTokensMock.mockReturnValue({
      availableTokens: [],
      hasTokens: false,
    });

    usePayWithMoneyAccountSectionMock.mockReturnValue({
      id: 'money-account',
      title: '',
      testID: 'pay-with-section-money-account',
      rows: [],
    });

    const { queryByText } = render();

    expect(queryByText(strings('confirm.custom_amount.buy_button'))).toBeNull();
  });

  it.each([TransactionType.predictWithdraw, TransactionType.perpsWithdraw])(
    'renders the withdraw confirm label for %s transactions',
    async (transactionType) => {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: transactionType,
        txParams: { from: '0x123' },
      } as never);

      const { getByText, findByText } = render({ transactionType });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(
        await findByText(
          strings('confirm.deposit_edit_amount_predict_withdraw'),
        ),
      ).toBeOnTheScreen();
    },
  );

  it.each([TransactionType.perpsDeposit, TransactionType.predictDeposit])(
    'renders "Send" confirm label for %s from Money Account',
    async (transactionType) => {
      useRouteMock.mockReturnValue({
        key: 'mock-route',
        name: 'MockScreen',
        params: { payWithOption: 'money_account' },
      } as never);

      useTransactionMetadataRequestMock.mockReturnValue({
        type: transactionType,
        txParams: { from: '0x123' },
      } as never);

      const { getByText, findByText } = render({ transactionType });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(
        await findByText(
          strings('confirm.deposit_edit_amount_money_account_send'),
        ),
      ).toBeOnTheScreen();
    },
  );

  it('hides PayTokenAmount when hidePayTokenAmount is true', () => {
    const { queryByText } = render({ hidePayTokenAmount: true });

    expect(queryByText('0 TST')).toBeNull();
    expect(
      queryByText(new RegExp(strings('confirm.label.pay_with'))),
    ).toBeOnTheScreen();
  });

  it('renders PayAccountSelector when supportAccountSelection is true', () => {
    const { getByTestId } = render({ supportAccountSelection: true });

    expect(getByTestId('pay-account-selector')).toBeOnTheScreen();
  });

  it('does not render PayAccountSelector when supportAccountSelection is false', () => {
    const { queryByTestId } = render({ supportAccountSelection: false });

    expect(queryByTestId('pay-account-selector')).toBeNull();
  });

  it('renders no funds alert message for moneyAccountDeposit when alert is present', () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: TransactionType.moneyAccountDeposit,
      txParams: { from: '0x123' },
    } as never);

    useTransactionPayAvailableTokensMock.mockReturnValue({
      availableTokens: [],
      hasTokens: false,
    });

    useTransactionCustomAmountAlertsMock.mockReturnValue({
      alertMessage: strings('alert_system.account_no_funds.message'),
    });

    const { getAllByText } = render({
      transactionType: TransactionType.moneyAccountDeposit,
    });

    // The help text renders under the amount for the blocking error.
    expect(
      getAllByText(strings('alert_system.account_no_funds.message'))[0],
    ).toBeOnTheScreen();
  });

  it('does not render no funds alert for moneyAccountDeposit when tokens available', () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: TransactionType.moneyAccountDeposit,
      txParams: { from: '0x123' },
    } as never);

    const { queryByText } = render({
      transactionType: TransactionType.moneyAccountDeposit,
    });

    expect(
      queryByText(strings('alert_system.account_no_funds.message')),
    ).toBeNull();
  });

  it('does not render PayAccountSelector when supportAccountSelection is true but selectedFiatPaymentMethodId exists', () => {
    useTransactionPayFiatPaymentMock.mockReturnValue({
      selectedPaymentMethodId: 'fiat-method-1',
    } as never);

    const { queryByTestId } = render({ supportAccountSelection: true });

    expect(queryByTestId('pay-account-selector')).toBeNull();
  });

  it('renders PayAccountSelector for moneyAccountDeposit when supportAccountSelection is true', async () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: TransactionType.moneyAccountDeposit,
      txParams: { from: '0x123' },
    } as never);

    const { getByTestId, getByText } = render({
      supportAccountSelection: true,
      transactionType: TransactionType.moneyAccountDeposit,
    });

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(getByTestId('pay-account-selector')).toBeOnTheScreen();
  });

  describe('PayWithRow visibility for moneyAccountDeposit', () => {
    it('renders PayWithRow while keyboard is visible for non-addMusd moneyAccountDeposit', () => {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);

      const { getByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(getByTestId('pay-with')).toBeOnTheScreen();
    });
  });

  describe('no-funds account with accountOverride', () => {
    function setupNoFundsWithOverride() {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);

      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });

      useAccountNoFundsAlertMock.mockReturnValue([
        {
          key: AlertKeys.AccountNoFunds,
          title: 'No funds',
          message: 'No funds available',
          severity: Severity.Danger,
          isBlocking: true,
        },
      ]);

      useTransactionAccountOverrideMock.mockReturnValue('0xoverride' as never);
    }

    it('hides transaction detail rows when account has no funds and override is present', async () => {
      setupNoFundsWithOverride();

      const { getByText, queryByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(queryByTestId('bridge-fee-row')).toBeNull();
    });

    it('hides buy section when account has no funds and override is present', async () => {
      setupNoFundsWithOverride();

      const { getByText, queryByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(
        queryByText(strings('confirm.custom_amount.buy_button')),
      ).toBeNull();
    });

    it('hides buy section during loading when override is present (prevents flash)', () => {
      // add-mUSD intent starts the stage in Loading (no keyboard) with deposit
      // prefill disabled, so the buy-section hide is exercised via the
      // `stage === Loading` term rather than the prefill-enabled gate.
      (getMoneyAccountDepositIntent as jest.Mock).mockReturnValue('addMusd');
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        batchId: '0xbatch',
        txParams: { from: '0x123' },
      } as never);

      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });

      useIsTransactionPayLoadingMock.mockReturnValue(true);
      useTransactionAccountOverrideMock.mockReturnValue('0xoverride' as never);
      useAccountNoFundsAlertMock.mockReturnValue([]);

      const { queryByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      // With an account override in the Loading stage, the buy section must
      // stay hidden to avoid a flash before the review renders.
      expect(
        queryByText(strings('confirm.custom_amount.buy_button')),
      ).toBeNull();
    });
  });

  describe('while the selected pay account is loading', () => {
    beforeEach(() => {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);

      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });

      useTransactionAccountOverrideMock.mockReturnValue('0xoverride' as never);
      useTransactionPayAccountLoadingMock.mockReturnValue(true);
    });

    it('renders the pay with skeleton and keyboard', () => {
      const { getByTestId, getByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(getByTestId('pay-with-row-skeleton')).toBeOnTheScreen();
      expect(getByText(strings('confirm.edit_amount_done'))).toBeOnTheScreen();
    });

    it('hides the buy section', () => {
      const { queryByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      expect(
        queryByText(strings('confirm.custom_amount.buy_button')),
      ).toBeNull();
    });
  });

  describe('buy section without accountOverride', () => {
    it('shows buy section when account has no funds but no override', async () => {
      useTransactionMetadataRequestMock.mockReturnValue({
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);

      useTransactionPayAvailableTokensMock.mockReturnValue({
        availableTokens: [],
        hasTokens: false,
      });

      useAccountNoFundsAlertMock.mockReturnValue([
        {
          key: AlertKeys.AccountNoFunds,
          title: 'No funds',
          message: 'No funds available',
          severity: Severity.Danger,
          isBlocking: true,
        },
      ]);

      useTransactionAccountOverrideMock.mockReturnValue(undefined);

      const { getByText } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      await act(async () => {
        fireEvent.press(getByText(strings('confirm.edit_amount_done')));
      });

      expect(
        getByText(strings('confirm.custom_amount.buy_button')),
      ).toBeOnTheScreen();
    });
  });
});

describe('CustomAmountInfoSkeleton', () => {
  it('renders skeleton without AccountSelectorSkeleton', () => {
    const { getByTestId, queryByTestId } = renderWithProvider(
      <CustomAmountInfoSkeleton />,
      {
        state: merge(
          {},
          simpleSendTransactionControllerMock,
          transactionApprovalControllerMock,
          otherControllersMock,
        ),
      },
    );

    expect(queryByTestId('account-selector-skeleton')).toBeNull();
    expect(getByTestId('custom-amount-caption')).toHaveStyle({
      position: 'absolute',
    });
  });
});

describe('PrefillCustomAmountInfoSkeleton', () => {
  it('pins the caption skeleton outside the amount flow', () => {
    const { getByTestId } = renderWithProvider(
      <PrefillCustomAmountInfoSkeleton />,
      {
        state: merge(
          {},
          simpleSendTransactionControllerMock,
          transactionApprovalControllerMock,
          otherControllersMock,
        ),
      },
    );

    expect(getByTestId('custom-amount-caption')).toHaveStyle({
      position: 'absolute',
    });
  });
});

describe('AdvancedCustomAmountInfoSkeleton', () => {
  it('renders skeleton with AccountSelectorSkeleton', () => {
    const { getByTestId } = renderWithProvider(
      <AdvancedCustomAmountInfoSkeleton />,
      {
        state: merge(
          {},
          simpleSendTransactionControllerMock,
          transactionApprovalControllerMock,
          otherControllersMock,
        ),
      },
    );

    expect(getByTestId('account-selector-skeleton')).toBeTruthy();
    expect(getByTestId('custom-amount-skeleton')).toBeTruthy();
    expect(getByTestId('pay-with-row-skeleton')).toBeTruthy();
    expect(getByTestId('custom-amount-caption')).toHaveStyle({
      position: 'absolute',
    });
  });

  it('renders skeleton without account and pay-with rows when autoSelectFiatPayment param is set', () => {
    jest.mocked(useRoute).mockReturnValue({
      key: 'mock-route',
      name: 'MockScreen',
      params: { autoSelectFiatPayment: true },
    } as never);

    const { getByTestId, queryByTestId } = renderWithProvider(
      <AdvancedCustomAmountInfoSkeleton />,
      {
        state: merge(
          {},
          simpleSendTransactionControllerMock,
          transactionApprovalControllerMock,
          otherControllersMock,
        ),
      },
    );

    expect(getByTestId('custom-amount-skeleton')).toBeTruthy();
    expect(queryByTestId('account-selector-skeleton')).toBeNull();
    expect(queryByTestId('pay-with-row-skeleton')).toBeNull();
  });
});
