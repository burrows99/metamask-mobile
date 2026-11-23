import {
  TRANSACTION_ID_MOCK,
  createCustomAmountInfo,
  createCustomAmountMock,
  createDeferredPromise,
  mockToast,
  mockTransactionPayControllerState,
  render,
  setControllerTransactions,
  setIsConfirmationSubmittingMock,
  setupCustomAmountInfoMocks,
  useConfirmActionsMock,
  useConfirmationContextMock,
  useIsTransactionPayLoadingMock,
  useTransactionCustomAmountMock,
  useTransactionMetadataRequestMock,
  useTransactionPayAvailableTokensMock,
  useTransactionPayFiatPaymentMock,
  useTransactionPayQuotesLastUpdatedMock,
  useTransactionPayQuotesMock,
} from './custom-amount-info.testUtils';
import React, { act } from 'react';
import { noop } from 'lodash';
import { toast } from '@metamask/design-system-react-native';
import Engine from '../../../../../../core/Engine';
import { CustomAmountInfo } from './custom-amount-info';
import { useConfirmationContext } from '../../../context/confirmation-context';
import { strings } from '../../../../../../../locales/i18n';
import { fireEvent, within } from '@testing-library/react-native';
import { TransactionType } from '@metamask/transaction-controller';
import { CustomAmountInfoTestIds } from './custom-amount-info.testIds';
import {
  ConfirmationFooterSelectorIDs,
  TransactionPayComponentIDs,
} from '../../../ConfirmationView.testIds';
import { mockTheme } from '../../../../../../util/theme';
import { DepositPrefillStatus } from '../../../hooks/transactions/useDepositPrefillAmount';

describe('CustomAmountInfo', () => {
  beforeEach(() => {
    setupCustomAmountInfoMocks();
  });

  describe('Money Account quote preparation', () => {
    const transactionId = 'money-account-deposit-transaction';

    function setControllerTransactionData({
      isLoading,
      quotesLastUpdated,
    }: {
      isLoading: boolean;
      quotesLastUpdated?: number;
    }) {
      mockTransactionPayControllerState.transactionData[transactionId] = {
        isLoading,
        quotesLastUpdated,
      };
    }

    function arrangePendingPreparation() {
      const deferred = createDeferredPromise();
      const updateTokenAmount = jest.fn(() => deferred.promise);
      useTransactionMetadataRequestMock.mockReturnValue({
        id: transactionId,
        type: TransactionType.moneyAccountDeposit,
        txParams: { from: '0x123' },
      } as never);
      setControllerTransactions([{ id: transactionId }]);
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({ updateTokenAmount }),
      );

      return { deferred, updateTokenAmount };
    }

    it('replaces the keypad with preparation feedback before the amount update resolves', () => {
      arrangePendingPreparation();
      const { getByTestId, getByText, queryByTestId, queryByText } = render({
        supportAccountSelection: true,
        transactionType: TransactionType.moneyAccountDeposit,
      });

      fireEvent.press(getByTestId('deposit-keyboard-done-button'));

      expect(queryByTestId('deposit-keyboard')).not.toBeOnTheScreen();
      expect(getByTestId('pay-account-selector')).toBeOnTheScreen();
      expect(getByTestId('pay-with')).toBeOnTheScreen();
      expect(
        getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();
      expect(
        getByText(
          strings('confirm.deposit_edit_amount_convert_token', {
            symbol: 'TST',
          }),
        ),
      ).toBeOnTheScreen();
      expect(
        queryByText(strings('confirm.preparing_order')),
      ).not.toBeOnTheScreen();
      expect(getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(getByTestId('bridge-time-row-skeleton')).toBeOnTheScreen();
      expect(getByTestId('total-row-skeleton')).toBeOnTheScreen();
    });

    it('blocks review rows and duplicate submission during preparation', () => {
      const { updateTokenAmount } = arrangePendingPreparation();
      const { getByTestId } = render({
        supportAccountSelection: true,
        transactionType: TransactionType.moneyAccountDeposit,
      });
      const doneButton = getByTestId('deposit-keyboard-done-button');

      act(() => {
        fireEvent.press(doneButton);
        fireEvent.press(doneButton);
      });

      // Both presses occur before React rerenders, so the synchronous guard
      // must prevent the second amount update.
      expect(updateTokenAmount).toHaveBeenCalledTimes(1);
      expect(
        getByTestId(CustomAmountInfoTestIds.REVIEW_ROWS).props.pointerEvents,
      ).toBe('none');
      // The amount stays pressable so preparation can never strand the user.
      expect(getByTestId('custom-amount-input')).toHaveProp(
        'accessibilityRole',
        'button',
      );
    });

    it('keeps the amount visually enabled during preparation', () => {
      arrangePendingPreparation();
      const { getByTestId } = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });

      fireEvent.press(getByTestId('deposit-keyboard-done-button'));

      expect(
        within(getByTestId(TransactionPayComponentIDs.AMOUNT_VALUE)).getByText(
          '1',
        ),
      ).toHaveStyle({
        color: mockTheme.colors.text.default,
      });
      expect(getByTestId('custom-amount-symbol')).toHaveStyle({
        color: mockTheme.colors.text.default,
      });
    });

    it('unblocks account and payment rows while waiting for quotes', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));

      setControllerTransactionData({ isLoading: true });
      useIsTransactionPayLoadingMock.mockReturnValue(true);
      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(view.queryByTestId('bridge-fee-row')).not.toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();
      expect(
        view.getByText(
          strings('confirm.deposit_edit_amount_convert_token', {
            symbol: 'TST',
          }),
        ),
      ).toBeOnTheScreen();
      expect(
        view.queryByText(strings('confirm.preparing_order')),
      ).not.toBeOnTheScreen();
      expect(
        view.getByTestId(CustomAmountInfoTestIds.REVIEW_ROWS).props
          .pointerEvents,
      ).toBe('auto');
      expect(view.getByTestId('custom-amount-input')).toHaveProp(
        'accessibilityRole',
        'button',
      );
    });

    it('keeps the loading review until Redux observes controller loading', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      setControllerTransactionData({ isLoading: true });

      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();

      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();

      // A fresh, non-empty quote settles the override into the populated review.
      useIsTransactionPayLoadingMock.mockReturnValue(false);
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).not.toBeDisabled();
    });

    it('ignores a stale Redux quote timestamp during controller loading handoff', async () => {
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(100);
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      setControllerTransactionData({ isLoading: true });

      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();

      // A fresh, non-empty quote newer than the baseline settles the loading
      // override. The timestamp bump alone is not enough — an empty pre-fetch
      // bump must not settle, so quotes must be present.
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(101);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).not.toBeDisabled();
    });

    it('keeps the loading review until Redux observes a fast completed quote', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      setControllerTransactionData({
        isLoading: false,
        quotesLastUpdated: 123,
      });

      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();

      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(123);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).not.toBeDisabled();
    });

    it('ignores stale quote updates while the amount is still committing', async () => {
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));

      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(2);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();

      setControllerTransactionData({
        isLoading: true,
        quotesLastUpdated: 2,
      });
      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();

      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(3);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
    });

    it('unblocks review rows when quote loading starts before the amount update settles', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));

      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();
      expect(
        view.getByTestId(CustomAmountInfoTestIds.REVIEW_ROWS).props
          .pointerEvents,
      ).toBe('auto');

      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });
    });

    it('shows the populated post-keypad state after quote loading settles', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));
      setControllerTransactionData({ isLoading: true });
      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });
      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      // A fresh, non-empty quote settles the override into the populated review.
      useIsTransactionPayLoadingMock.mockReturnValue(false);
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      view.rerender(
        createCustomAmountInfo({
          transactionType: TransactionType.moneyAccountDeposit,
        }),
      );

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).not.toBeDisabled();
      expect(view.queryByTestId('deposit-keyboard')).not.toBeOnTheScreen();
    });

    it('restores amount entry and the existing toast after preparation fails', async () => {
      const { deferred } = arrangePendingPreparation();
      const view = render({
        transactionType: TransactionType.moneyAccountDeposit,
      });
      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));

      await act(async () => {
        deferred.reject(new Error('update failed'));
        await Promise.resolve();
      });

      expect(view.getByTestId('deposit-keyboard')).toBeOnTheScreen();
      expect(view.getByTestId('custom-amount-input')).toHaveProp(
        'accessibilityRole',
        'button',
      );
      expect(mockToast).toHaveBeenCalledTimes(1);
    });

    it('unblocks non-Money review rows once quote loading starts', async () => {
      const deferred = createDeferredPromise();
      const nonMoneyTransactionId = 'non-money-transaction';
      useTransactionMetadataRequestMock.mockReturnValue({
        id: nonMoneyTransactionId,
        type: TransactionType.contractInteraction,
        txParams: { from: '0x123' },
      } as never);
      useTransactionCustomAmountMock.mockReturnValue(
        createCustomAmountMock({
          updateTokenAmount: jest.fn(() => deferred.promise),
        }),
      );
      const view = render();

      fireEvent.press(view.getByTestId('deposit-keyboard-done-button'));

      expect(view.queryByTestId('deposit-keyboard')).not.toBeOnTheScreen();
      expect(view.getByTestId('custom-amount-input')).toHaveProp(
        'accessibilityRole',
        'button',
      );
      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();

      mockTransactionPayControllerState.transactionData[nonMoneyTransactionId] =
        { isLoading: true };
      await act(async () => {
        deferred.resolve();
        await deferred.promise;
      });

      expect(view.getByTestId('bridge-fee-row-skeleton')).toBeOnTheScreen();
      expect(
        view.getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
      ).toBeDisabled();

      useIsTransactionPayLoadingMock.mockReturnValue(true);
      view.rerender(createCustomAmountInfo());
      expect(
        view.getByTestId(CustomAmountInfoTestIds.REVIEW_ROWS).props
          .pointerEvents,
      ).toBe('auto');

      // A fresh, non-empty quote settles the override into the populated review.
      useIsTransactionPayLoadingMock.mockReturnValue(false);
      useTransactionPayQuotesMock.mockReturnValue([{}] as never);
      useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
      view.rerender(createCustomAmountInfo());

      expect(view.getByTestId('bridge-fee-row')).toBeOnTheScreen();
    });
  });

  it('calls onAmountSubmit when Done button is pressed', async () => {
    const mockOnAmountSubmit = jest.fn();

    const { getByText } = render({ onAmountSubmit: mockOnAmountSubmit });

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(mockOnAmountSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls updateTokenAmount when Done is pressed', async () => {
    const updateTokenAmountMock = jest.fn();
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({ updateTokenAmount: updateTokenAmountMock }),
    );

    const { getByText } = render();

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
  });

  it('marks the confirmation as submitting when the confirm button is pressed', async () => {
    const onConfirmMock = jest.fn();
    useConfirmActionsMock.mockReturnValue({
      onConfirm: onConfirmMock,
      onReject: jest.fn(),
    });

    const view = render();

    await act(async () => {
      fireEvent.press(view.getByText(strings('confirm.edit_amount_done')));
    });

    useIsTransactionPayLoadingMock.mockReturnValue(true);
    view.rerender(createCustomAmountInfo());
    // A fresh, non-empty quote settles the override into the populated review.
    useIsTransactionPayLoadingMock.mockReturnValue(false);
    useTransactionPayQuotesMock.mockReturnValue([{}] as never);
    useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
    view.rerender(createCustomAmountInfo());

    await act(async () => {
      fireEvent.press(
        view.getByText(strings('confirm.deposit_edit_amount_done')),
      );
    });

    expect(setIsConfirmationSubmittingMock).toHaveBeenCalledWith(true);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('shows toast, keeps keyboard open, and skips onAmountSubmit when updateTokenAmount rejects on Done', async () => {
    const error = new Error('update failed');
    const updateTokenAmountMock = jest.fn().mockRejectedValue(error);
    const mockOnAmountSubmit = jest.fn();
    useTransactionMetadataRequestMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      type: TransactionType.contractInteraction,
      txParams: { from: '0x123' },
    } as never);
    setControllerTransactions([{ id: TRANSACTION_ID_MOCK }]);
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({ updateTokenAmount: updateTokenAmountMock }),
    );

    const { getByText, queryByText, getByTestId } = render({
      onAmountSubmit: mockOnAmountSubmit,
    });

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    // onAmountSubmit must NOT be called — keep keyboard visible for retry
    expect(mockOnAmountSubmit).not.toHaveBeenCalled();
    // Toast must be shown with the transaction-update title
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) }),
    );
    // Keyboard stays open: Done button and amount editing remain available.
    expect(queryByText(strings('confirm.edit_amount_done'))).toBeOnTheScreen();
    expect(getByTestId('custom-amount-input')).toHaveProp(
      'accessibilityRole',
      'button',
    );
  });

  it('does not show toast when the transaction was removed before updateTokenAmount rejects', async () => {
    const error = new Error(
      `Cannot update transaction as ID not found - ${TRANSACTION_ID_MOCK}`,
    );
    const updateTokenAmountMock = jest.fn().mockRejectedValue(error);
    const mockOnAmountSubmit = jest.fn();
    useTransactionMetadataRequestMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      type: TransactionType.contractInteraction,
      txParams: { from: '0x123' },
    } as never);
    // Confirmation dismissed by back navigation: the transaction is gone.
    setControllerTransactions([]);
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({ updateTokenAmount: updateTokenAmountMock }),
    );

    const { getByText } = render({
      onAmountSubmit: mockOnAmountSubmit,
    });

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockOnAmountSubmit).not.toHaveBeenCalled();
  });

  it('does not show toast when only unrelated transactions remain after the tracked one is removed', async () => {
    const error = new Error('update failed');
    const updateTokenAmountMock = jest.fn().mockRejectedValue(error);
    const mockOnAmountSubmit = jest.fn();
    useTransactionMetadataRequestMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      type: TransactionType.contractInteraction,
      txParams: { from: '0x123' },
    } as never);
    // Tracked transaction is gone; an unrelated one still lingers in state.
    setControllerTransactions([{ id: 'unrelated-tx-id' }]);
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({ updateTokenAmount: updateTokenAmountMock }),
    );

    const { getByText } = render({
      onAmountSubmit: mockOnAmountSubmit,
    });

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(updateTokenAmountMock).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockOnAmountSubmit).not.toHaveBeenCalled();
  });

  it('invokes updateFiatPayment callback when fiat payment is active', async () => {
    const updateFiatPaymentMock = Engine.context.TransactionPayController
      .updateFiatPayment as jest.Mock;
    updateFiatPaymentMock.mockImplementation(
      ({ callback }: { callback: (fp: { amountFiat: string }) => void }) => {
        callback({ amountFiat: '' });
      },
    );

    useTransactionPayFiatPaymentMock.mockReturnValue({
      selectedPaymentMethodId: 'fiat-method-1',
    } as never);

    useTransactionMetadataRequestMock.mockReturnValue({
      id: 'tx-1',
      type: TransactionType.contractInteraction,
      txParams: { from: '0x123' },
    } as never);

    const { getByText } = render();

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    expect(updateFiatPaymentMock).toHaveBeenCalledTimes(1);
  });

  it('closes toast via close button when amount update fails', async () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      type: TransactionType.contractInteraction,
      txParams: { from: '0x123' },
    } as never);
    setControllerTransactions([{ id: TRANSACTION_ID_MOCK }]);

    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({
        updateTokenAmount: jest.fn().mockRejectedValue(new Error('fail')),
      }),
    );

    const { getByText } = render();

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    const toastArg = mockToast.mock.calls[0][0] as { onClose: () => void };
    toastArg.onClose();

    expect(
      (toast as typeof toast & { dismiss: jest.Mock }).dismiss,
    ).toHaveBeenCalledTimes(1);
  });

  it('opens keyboard when custom amount input is pressed', async () => {
    // Reach a settled review stage first: commit the amount (Loading override),
    // then a fresh quote settles it to ShowTotals. In review the keyboard is
    // hidden but the amount input is pressable, so tapping it re-opens the
    // keyboard.
    useTransactionMetadataRequestMock.mockReturnValue({
      id: 'test-tx-id',
      type: TransactionType.moneyAccountDeposit,
      txParams: { from: '0x123' },
    } as never);
    setControllerTransactions([{ id: 'test-tx-id' }]);

    const view = render({
      transactionType: TransactionType.moneyAccountDeposit,
    });

    await act(async () => {
      fireEvent.press(view.getByText(strings('confirm.edit_amount_done')));
    });

    // Settle the Loading override into the review.
    useTransactionPayQuotesMock.mockReturnValue([{}] as never);
    useTransactionPayQuotesLastUpdatedMock.mockReturnValue(1);
    view.rerender(
      createCustomAmountInfo({
        transactionType: TransactionType.moneyAccountDeposit,
      }),
    );

    expect(view.queryByTestId('deposit-keyboard')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('custom-amount-input'));
    });

    expect(view.getByTestId('deposit-keyboard')).toBeOnTheScreen();
  });

  it('shows keyboard immediately when autoSelectFiatPayment is set even with prefill enabled', () => {
    useTransactionCustomAmountMock.mockReturnValue(
      createCustomAmountMock({
        depositPrefillStatus: DepositPrefillStatus.Skipped,
      }),
    );

    const { getByTestId } = render({ autoSelectFiatPayment: true });

    expect(getByTestId('deposit-keyboard')).toBeOnTheScreen();
  });

  it('renders predict buy message when no tokens available for predictDeposit', () => {
    useTransactionMetadataRequestMock.mockReturnValue({
      type: TransactionType.predictDeposit,
      txParams: { from: '0x123' },
    } as never);

    useTransactionPayAvailableTokensMock.mockReturnValue({
      availableTokens: [],
      hasTokens: false,
    });

    const { getByText } = render({
      transactionType: TransactionType.predictDeposit,
    });

    expect(
      getByText(strings('confirm.custom_amount.buy_predict')),
    ).toBeOnTheScreen();
  });

  it('renders headless buy error when no alert message is present', () => {
    const headlessBuyError = 'Unable to complete purchase';

    useConfirmationContextMock.mockReturnValue({
      mmPayRequestInProgressNavHandler: { current: false },
      headlessBuyError,
      isFooterVisible: true,
      isConfirmationSubmitting: false,
      isConfirmationSubmittingRef: { current: false },
      setIsConfirmationSubmitting: setIsConfirmationSubmittingMock,
      isHeadlessBuyInProgress: false,
      isTransactionDataUpdating: false,
      isTransactionValueUpdating: false,
      setHeadlessBuyError: noop,
      setIsFooterVisible: noop,
      setPendingFiatAmount: noop,
      pendingFiatAmount: undefined,
      setIsHeadlessBuyInProgress: noop,
      setIsTransactionDataUpdating: noop,
      setIsTransactionValueUpdating: noop,
      isGasFeeModalVisible: false,
      setIsGasFeeModalVisible: noop,
    } as ReturnType<typeof useConfirmationContext>);

    const { getByText } = render();

    expect(getByText(headlessBuyError)).toBeOnTheScreen();
  });

  it('keeps Done enabled and final confirm disabled when only a headless buy error is present', async () => {
    const headlessBuyError = 'Unable to complete purchase';

    useConfirmationContextMock.mockReturnValue({
      mmPayRequestInProgressNavHandler: { current: false },
      headlessBuyError,
      isFooterVisible: true,
      isConfirmationSubmitting: false,
      isConfirmationSubmittingRef: { current: false },
      setIsConfirmationSubmitting: setIsConfirmationSubmittingMock,
      isHeadlessBuyInProgress: false,
      isTransactionDataUpdating: false,
      isTransactionValueUpdating: false,
      setHeadlessBuyError: noop,
      setIsFooterVisible: noop,
      setPendingFiatAmount: noop,
      pendingFiatAmount: undefined,
      setIsHeadlessBuyInProgress: noop,
      setIsTransactionDataUpdating: noop,
      setIsTransactionValueUpdating: noop,
      isGasFeeModalVisible: false,
      setIsGasFeeModalVisible: noop,
    } as ReturnType<typeof useConfirmationContext>);

    const { getByTestId } = render();

    // Continue is allowed: the headless buy error does not disable Done.
    const doneButton = getByTestId('deposit-keyboard-done-button');
    expect(doneButton).not.toBeDisabled();

    // Advance to the review stage and assert the final confirm is blocked.
    await act(async () => {
      fireEvent.press(doneButton);
    });

    expect(
      getByTestId(ConfirmationFooterSelectorIDs.CONFIRM_BUTTON),
    ).toBeDisabled();
  });

  it('resets submitting state when onConfirm rejects', async () => {
    useConfirmActionsMock.mockReturnValue({
      onConfirm: jest.fn().mockRejectedValue(new Error('confirm failed')),
      onReject: jest.fn(),
    });

    const { getByText, getByTestId } = render();

    await act(async () => {
      fireEvent.press(getByText(strings('confirm.edit_amount_done')));
    });

    // handleConfirm re-throws after resetting the submitting flag.
    // Directly invoke and await the handler to prevent the unhandled rejection.
    const confirmButton = getByTestId('confirm-button');
    let pressable: typeof confirmButton | null = confirmButton;
    while (pressable && !pressable.props.onPress) {
      pressable = pressable.parent;
    }

    if (!pressable) {
      throw new Error('Could not find pressable ancestor with onPress');
    }

    try {
      await act(async () => {
        await pressable.props.onPress();
      });
    } catch {
      // Expected: handleConfirm re-throws after resetting submitting state
    }

    expect(setIsConfirmationSubmittingMock).toHaveBeenCalledWith(true);
    expect(setIsConfirmationSubmittingMock).toHaveBeenCalledWith(false);
  });
});
