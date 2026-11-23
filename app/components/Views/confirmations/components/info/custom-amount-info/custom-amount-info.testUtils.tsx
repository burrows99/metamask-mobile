import { merge, noop } from 'lodash';
import { toast } from '@metamask/design-system-react-native';
import renderWithProvider from '../../../../../../util/test/renderWithProvider';
import Engine from '../../../../../../core/Engine';
import { CustomAmountInfo, CustomAmountInfoProps } from './custom-amount-info';
import { simpleSendTransactionControllerMock } from '../../../__mocks__/controllers/transaction-controller-mock';
import { transactionApprovalControllerMock } from '../../../__mocks__/controllers/approval-controller-mock';
import { otherControllersMock } from '../../../__mocks__/controllers/other-controllers-mock';
import { useTransactionPayToken } from '../../../hooks/pay/useTransactionPayToken';
import { useTransactionCustomAmount } from '../../../hooks/transactions/useTransactionCustomAmount';
import { useConfirmationContext } from '../../../context/confirmation-context';
import { Alert } from '../../../types/alerts';
import {
  AlertsContextParams,
  useAlerts,
} from '../../../context/alert-system-context';
import { useTransactionCustomAmountAlerts } from '../../../hooks/transactions/useTransactionCustomAmountAlerts';
import { useAccountTokens } from '../../../hooks/send/useAccountTokens';
import { useTransactionPayAvailableTokens } from '../../../hooks/pay/useTransactionPayAvailableTokens';
import { AssetType } from '../../../types/token';
import {
  useTransactionPayFiatPayment,
  useTransactionPayRequiredTokens,
  useTransactionPayPrimaryRequiredToken,
  useIsTransactionPayQuoteLoading,
  useTransactionPayQuotesRaw,
  useTransactionPayQuotesLastUpdated,
} from '../../../hooks/pay/useTransactionPayData';
import { Hex } from '@metamask/utils';
import { useRoute } from '@react-navigation/native';
import { getMoneyAccountDepositIntent } from '../../../../../UI/Money/hooks/useMoneyAccount';
import { TransactionType } from '@metamask/transaction-controller';
import { useConfirmActions } from '../../../hooks/useConfirmActions';
import { useTransactionMetadataRequest } from '../../../hooks/transactions/useTransactionMetadataRequest';
import { useTokenFiatRates } from '../../../hooks/tokens/useTokenFiatRates';
import { useTransactionPayWithdraw } from '../../../hooks/pay/useTransactionPayWithdraw';
import { useTransactionAccountOverride } from '../../../hooks/transactions/useTransactionAccountOverride';
import { useMoneyNoFeeTokens } from '../../../hooks/pay/useMoneyNoFeeTokens';
import { usePayWithMoneyAccountSection } from '../../../hooks/pay/sections/usePayWithMoneyAccountSection';
import useClearConfirmationOnBackSwipe from '../../../hooks/ui/useClearConfirmationOnBackSwipe';
import { useAccountNoFundsAlert } from '../../../hooks/alerts/useAccountNoFundsAlert';
import { useTransactionPayAccountLoading } from '../../../hooks/pay/useTransactionPayAccountLoading';
import { useAutomaticTransactionPayToken } from '../../../hooks/pay/useAutomaticTransactionPayToken';
import { DepositPrefillStatus } from '../../../hooks/transactions/useDepositPrefillAmount';
import { useTransactionPayMetrics } from '../../../hooks/pay/useTransactionPayMetrics';
import { useTransactionPayPostQuote } from '../../../hooks/pay/useTransactionPayPostQuote';
import { BalanceProjection } from '../../../../../UI/Money/components/BalanceProjection';
import useMMPayNavigation from '../../../hooks/ui/useMMPayNavigation';
import { useSnapAmountToMax } from '../../../hooks/custom-amount/useSnapAmountToMax';

export const MEMBERSHIP_SUBSCRIPTION_TRANSACTION_TYPE =
  TransactionType.membershipSubscription;

jest.mock('@metamask/design-system-react-native', () => {
  const ReactActual = jest.requireActual('react');
  const PropTypes = jest.requireActual('prop-types');
  const { View } = jest.requireActual('react-native');
  const actual = jest.requireActual('@metamask/design-system-react-native');

  const BottomSheet = ReactActual.forwardRef(
    (
      {
        children,
        onClose,
        onOpen,
        goBack,
        style,
        twClassName: _twClassName,
        testID,
        accessibilityLabel,
      }: {
        children?: import('react').ReactNode;
        onClose?: (hasCallback?: boolean) => void;
        onOpen?: () => void;
        goBack?: () => void;
        style?: unknown;
        twClassName?: unknown;
        testID?: string;
        accessibilityLabel?: string;
      },
      ref: import('react').Ref<{
        onOpenBottomSheet: (callback?: () => void) => void;
        onCloseBottomSheet: (callback?: () => void) => void;
      }>,
    ) => {
      ReactActual.useImperativeHandle(ref, () => ({
        onOpenBottomSheet: (callback?: () => void) => {
          onOpen?.();
          callback?.();
        },
        onCloseBottomSheet: (callback?: () => void) => {
          const hasCallback = Boolean(callback);
          onClose?.(hasCallback);
          goBack?.();
          callback?.();
        },
      }));
      return ReactActual.createElement(
        View,
        {
          testID: testID || 'design-system-bottom-sheet-mock',
          style,
          accessibilityLabel,
        },
        children,
      );
    },
  );
  BottomSheet.displayName = 'BottomSheet';
  BottomSheet.propTypes = {
    children: PropTypes.node,
    onClose: PropTypes.func,
    onOpen: PropTypes.func,
    goBack: PropTypes.func,
    style: PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.array,
      PropTypes.number,
    ]),
    twClassName: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    testID: PropTypes.string,
    accessibilityLabel: PropTypes.string,
  };

  return {
    ...actual,
    BottomSheet,
    toast: Object.assign(jest.fn(), { dismiss: jest.fn() }),
  };
});

jest.mock('../../../hooks/ui/useClearConfirmationOnBackSwipe', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../hooks/custom-amount/useSnapAmountToMax', () => ({
  ...jest.requireActual('../../../hooks/custom-amount/useSnapAmountToMax'),
  useSnapAmountToMax: jest.fn(),
}));
jest.mock('../../../hooks/ui/useMMPayNavigation', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../hooks/alerts/useAccountNoFundsAlert', () => ({
  useAccountNoFundsAlert: jest.fn(),
}));
jest.mock('../../../hooks/pay/useTransactionPayAccountLoading', () => ({
  useTransactionPayAccountLoading: jest.fn(),
}));
jest.mock('../../../hooks/tokens/useTokenFiatRates', () => ({
  useTokenFiatRates: jest.fn(),
  useTokenFiatRate: jest.fn(),
}));
jest.mock('../../../hooks/pay/useAutomaticTransactionPayToken', () => ({
  useAutomaticTransactionPayToken: jest.fn(),
}));
jest.mock('../../../hooks/pay/useTransactionPayToken', () => ({
  useTransactionPayToken: jest.fn(),
}));
jest.mock('../../../hooks/transactions/useTransactionCustomAmount', () => ({
  MAX_LENGTH: 28,
  useTransactionCustomAmount: jest.fn(),
}));
jest.mock('../../../context/confirmation-context', () => ({
  ConfirmationContextProvider: jest.fn(),
  useConfirmationContext: jest.fn(),
}));
jest.mock('../../../context/alert-system-context', () => ({
  AlertsContextProvider: jest.fn(),
  useAlerts: jest.fn(),
}));
jest.mock(
  '../../../hooks/transactions/useTransactionCustomAmountAlerts',
  () => ({
    useTransactionCustomAmountAlerts: jest.fn(),
  }),
);
jest.mock('../../../hooks/pay/useTransactionPayMetrics', () => ({
  useTransactionPayMetrics: jest.fn(),
}));
jest.mock('../../../hooks/pay/useTransactionPayPostQuote', () => ({
  useTransactionPayPostQuote: jest.fn(),
}));
jest.mock('../../../hooks/send/useAccountTokens', () => ({
  useAccountTokens: jest.fn(),
}));
jest.mock('../../../../../UI/Predict/hooks/usePredictAccountState', () => ({
  usePredictAccountState: () => ({
    data: undefined,
    isLoading: false,
  }),
}));
jest.mock('../../../hooks/pay/useTransactionPayAvailableTokens', () => ({
  useTransactionPayAvailableTokens: jest.fn(),
}));
jest.mock('../../../hooks/pay/useTransactionPayData', () => ({
  useTransactionPayQuotesRaw: jest.fn(),
  useTransactionPayQuotes: jest.fn(),
  useTransactionPayQuotesLastUpdated: jest.fn(),
  useTransactionPayRequiredTokens: jest.fn(),
  useTransactionPayPrimaryRequiredToken: jest.fn(),
  useTransactionPaySourceAmounts: jest.fn(),
  useIsTransactionPayQuoteLoading: jest.fn(),
  useIsTransactionPayLoading: jest.fn(),
  useTransactionPayTotals: jest.fn(),
  useTransactionPayIsMaxAmount: jest.fn(),
  useTransactionPayIsPostQuote: jest.fn(),
  useTransactionPayFiatPayment: jest.fn(),
  useTransactionPayQuoteError: jest.fn(),
  useIsTransactionPaySubmitReady: jest.fn(),
}));
jest.mock('../../../hooks/gas/usePredictWithdrawGasFeeToken', () => ({
  usePredictWithdrawGasFeeToken: () => ({
    isPending: false,
    isUnavailable: false,
    recheck: () => Promise.resolve(true),
  }),
}));
jest.mock(
  '../../../hooks/pay/useTransactionPaySelectedFiatPaymentMethod',
  () => ({
    useTransactionPaySelectedFiatPaymentMethod: jest.fn(),
  }),
);
jest.mock('../../../hooks/useConfirmActions', () => ({
  useConfirmActions: jest.fn(),
}));
jest.mock('../../../hooks/transactions/useTransactionMetadataRequest', () => ({
  useTransactionMetadataRequest: jest.fn(),
  useTransactionMetadataOrThrow: jest.fn(),
}));
jest.mock('../../../hooks/pay/useTransactionPayWithdraw', () => ({
  useTransactionPayWithdraw: jest.fn(() => ({
    isWithdraw: false,
    canSelectWithdrawToken: false,
  })),
}));
jest.mock('../../../hooks/transactions/useTransactionAccountOverride', () => ({
  useTransactionAccountOverride: jest.fn(),
}));
jest.mock('../../../hooks/pay/useMoneyNoFeeTokens', () => ({
  useMoneyNoFeeTokens: jest.fn(),
}));
jest.mock('../../../hooks/pay/sections/usePayWithMoneyAccountSection', () => ({
  PAY_WITH_MONEY_ACCOUNT_SECTION_TEST_ID: 'pay-with-section-money-account',
  PAY_WITH_MONEY_ACCOUNT_ROW_TEST_ID: 'pay-with-money-account-row',
  usePayWithMoneyAccountSection: jest.fn(),
}));
// Reaches the Money Account balance query via `useIsMoneyAccountFlagDefault`,
// which the `usePayWithMoneyAccountSection` mock above does not intercept.
jest.mock('../../../hooks/pay/usePayMoneyAccountAvailable', () => ({
  // Not a jest.fn(): `jest.resetAllMocks()` below would wipe its return value.
  usePayMoneyAccountAvailable: () => ({ isAvailable: true, isPending: false }),
}));
jest.mock('../../rows/perps-account-picker-row', () => ({
  PerpsAccountPickerRow: () => null,
}));
jest.mock('../../rows/perps-receive-to-row', () => ({
  DEFAULT_PERPS_RECEIVE_DESTINATION: 'hyperliquid',
  PerpsReceiveToRow: () => null,
}));
jest.mock('../../rows/perps-withdraw-from-row', () => ({
  DEFAULT_PERPS_WITHDRAW_SOURCE: 'hyperliquid',
  PerpsWithdrawFromRow: () => null,
}));
jest.mock('../../rows/predict-account-picker-row', () => ({
  PredictAccountPickerRow: () => null,
}));
jest.mock('../../../../../../util/transaction-controller', () => ({}));
jest.mock('../../../../../UI/Money/hooks/useMoneyAccount', () => ({
  ...jest.requireActual('../../../../../UI/Money/hooks/useMoneyAccount'),
  getMoneyAccountDepositIntent: jest.fn(),
}));

export const mockTransactionPayControllerState = {
  transactionData: {} as Record<
    string,
    { isLoading?: boolean; quotesLastUpdated?: number }
  >,
};

jest.mock('../../../../../../core/Engine', () => ({
  context: {
    TransactionPayController: {
      get state() {
        return mockTransactionPayControllerState;
      },
      updateFiatPayment: jest.fn(),
    },
    TransactionController: {
      state: { transactions: [] },
    },
  },
}));
jest.mock('../../PayAccountSelector', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View testID="pay-account-selector" />,
  };
});
jest.mock('../../../../../UI/Money/components/BalanceProjection', () => ({
  BalanceProjection: jest.fn(() => null),
}));
jest.mock('../../../hooks/metrics/useConfirmationAlertMetrics', () => ({
  useConfirmationAlertMetrics: () => ({
    trackInlineAlertClicked: jest.fn(),
    trackAlertActionClicked: jest.fn(),
    trackAlertRendered: jest.fn(),
  }),
}));
jest.mock('../../../hooks/metrics/useConfirmationMetricEvents', () => ({
  useConfirmationMetricEvents: () => ({
    setConfirmationMetric: jest.fn(),
  }),
}));
jest.mock('../../../../../hooks/useAnalytics/useAnalytics', () => ({
  useAnalytics: () => ({
    trackEvent: jest.fn(),
    createEventBuilder: jest.fn(() => ({
      addProperties: jest.fn(() => ({ build: () => 'built-event' })),
    })),
  }),
}));

// TRAM-3623 funnel events flow through the ramps-owned typed analytics callback.
export const mockRampsTrackEvent = jest.fn();
jest.mock('../../../../../UI/Ramp/hooks/useAnalytics', () => ({
  __esModule: true,
  default: () => mockRampsTrackEvent,
}));

export const mockUseRampsUserRegion = jest.fn(() => ({
  userRegion: { regionCode: 'us-ca' },
  setUserRegion: jest.fn(),
}));
jest.mock('../../../../../UI/Ramp/hooks/useRampsUserRegion', () => ({
  useRampsUserRegion: () => mockUseRampsUserRegion(),
}));

/** Returns the payload for the first ramps funnel emit of `event`. */
export function emittedPayloadFor(
  event: string,
): Record<string, unknown> | undefined {
  return mockRampsTrackEvent.mock.calls.find(([type]) => type === event)?.[1];
}

/** How many times the ramps funnel emitted `event`. */
export function emitCount(event: string): number {
  return mockRampsTrackEvent.mock.calls.filter(([type]) => type === event)
    .length;
}

export const mockGoToBuy = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: jest.fn(),
  useRoute: jest.fn(() => ({ params: {} })),
}));

jest.mock('../../../../../UI/Ramp/hooks/useRampNavigation', () => ({
  ...jest.requireActual('../../../../../UI/Ramp/hooks/useRampNavigation'),
  useRampNavigation: () => ({
    goToBuy: mockGoToBuy,
  }),
}));

jest.mock('../../../../../UI/Ramp/hooks/useHasFiatProvider', () => ({
  useHasFiatProvider: () => true,
}));

jest.mock('../../../../../UI/Ramp/hooks/useRampsPaymentMethods', () => ({
  useRampsPaymentMethods: () => ({
    paymentMethods: [],
    selectedPaymentMethod: null,
    setSelectedPaymentMethod: jest.fn(),
    isFetching: false,
    isLoading: false,
    status: 'idle',
    isSuccess: false,
    error: null,
  }),
}));

export const TOKEN_ADDRESS_MOCK = '0x123' as Hex;
export const CHAIN_ID_MOCK = '0x1' as Hex;
export const TRANSACTION_ID_MOCK = 'tx-mock-id';

export function setControllerTransactions(transactions: { id: string }[]) {
  (
    Engine.context.TransactionController as unknown as {
      state: { transactions: { id: string }[] };
    }
  ).state = { transactions };
}

export const mockToast = toast as unknown as jest.Mock;

export interface DeferredPromise {
  promise: Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
}

export function createDeferredPromise(): DeferredPromise {
  let reject: DeferredPromise['reject'] = noop;
  let resolve: DeferredPromise['resolve'] = noop;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
}

// CustomAmountInfo is memoized. Tests update hook mocks then rerender with the
// same props; a changing non-visual child busts memo without remounting state.
export let customAmountInfoRenderEpoch = false;

export function createCustomAmountInfo(
  props: CustomAmountInfoProps & { transactionType?: TransactionType } = {},
) {
  customAmountInfoRenderEpoch = !customAmountInfoRenderEpoch;
  return (
    <CustomAmountInfo {...props}>
      {customAmountInfoRenderEpoch}
    </CustomAmountInfo>
  );
}

export function render(
  props: CustomAmountInfoProps & { transactionType?: TransactionType } = {},
) {
  return renderWithProvider(createCustomAmountInfo(props), {
    state: merge(
      {},
      simpleSendTransactionControllerMock,
      transactionApprovalControllerMock,
      otherControllersMock,
      {
        engine: {
          backgroundState: {
            TransactionController: {
              transactions: [
                {
                  type:
                    props.transactionType ||
                    TransactionType.contractInteraction,
                },
              ],
            },
          },
        },
      },
    ),
  });
}

export const useTransactionPayTokenMock = jest.mocked(useTransactionPayToken);
export const useConfirmationContextMock = jest.mocked(useConfirmationContext);
export const useAlertsMock = jest.mocked(useAlerts);
export const useAccountTokensMock = jest.mocked(useAccountTokens);
export const useConfirmActionsMock = jest.mocked(useConfirmActions);

export const useTransactionPayFiatPaymentMock = jest.mocked(
  useTransactionPayFiatPayment,
);

export const useTransactionPayRequiredTokensMock = jest.mocked(
  useTransactionPayRequiredTokens,
);

export const useTransactionPayAvailableTokensMock = jest.mocked(
  useTransactionPayAvailableTokens,
);

export const useIsTransactionPayLoadingMock = jest.mocked(
  useIsTransactionPayQuoteLoading,
);

export const useTransactionPayQuotesMock = jest.mocked(
  useTransactionPayQuotesRaw,
);
export const useTransactionPayQuotesLastUpdatedMock = jest.mocked(
  useTransactionPayQuotesLastUpdated,
);

export const useTransactionPayPrimaryRequiredTokenMock = jest.mocked(
  useTransactionPayPrimaryRequiredToken,
);

export const useTransactionCustomAmountAlertsMock = jest.mocked(
  useTransactionCustomAmountAlerts,
);

export const useTransactionCustomAmountMock = jest.mocked(
  useTransactionCustomAmount,
);
export const useTransactionPayPostQuoteMock = jest.mocked(
  useTransactionPayPostQuote,
);
export type CustomAmountMock = ReturnType<typeof useTransactionCustomAmount>;
export const createCustomAmountMock = (
  overrides: Partial<CustomAmountMock> = {},
): CustomAmountMock => ({
  amountFiat: '123.45',
  amountHuman: '0',
  amountHumanDebounced: '0',
  amountFiatDebounced: '0',
  depositPrefillStatus: DepositPrefillStatus.Disabled,
  hasInput: true,
  hasPrefetchedQuote: false,
  hasUserEditedAmountRef: { current: false },
  isInputChanged: false,
  isPrefillPending: false,
  updatePendingAmount: noop,
  updatePendingAmountPercentage: () => false,
  updateTokenAmount: jest.fn(),
  ...overrides,
});

export const useTransactionMetadataRequestMock = jest.mocked(
  useTransactionMetadataRequest,
);

export const useTokenFiatRatesMock = jest.mocked(useTokenFiatRates);
export const useTransactionPayWithdrawMock = jest.mocked(
  useTransactionPayWithdraw,
);
export const useTransactionAccountOverrideMock = jest.mocked(
  useTransactionAccountOverride,
);
export const useClearConfirmationOnBackSwipeMock = jest.mocked(
  useClearConfirmationOnBackSwipe,
);
export const useMoneyNoFeeTokensMock = jest.mocked(useMoneyNoFeeTokens);
export const usePayWithMoneyAccountSectionMock = jest.mocked(
  usePayWithMoneyAccountSection,
);
export const setIsConfirmationSubmittingMock = jest.fn();
export const useAccountNoFundsAlertMock = jest.mocked(useAccountNoFundsAlert);
export const useTransactionPayAccountLoadingMock = jest.mocked(
  useTransactionPayAccountLoading,
);

export const useRouteMock = jest.mocked(useRoute);
export const useSnapAmountToMaxMock = jest.mocked(useSnapAmountToMax);

export function setupCustomAmountInfoMocks() {
  jest.resetAllMocks();

  useSnapAmountToMaxMock.mockReturnValue({
    isSnapToMax: () => false,
    resolveAmountFiat: (amount: string) => amount,
  });
  mockToast.mockReset();
  mockTransactionPayControllerState.transactionData = {};

  mockUseRampsUserRegion.mockReturnValue({
    userRegion: { regionCode: 'us-ca' },
    setUserRegion: jest.fn(),
  });

  useRouteMock.mockReturnValue({
    key: 'mock-route',
    name: 'MockScreen',
    params: {},
  } as never);

  useTransactionAccountOverrideMock.mockReturnValue(undefined);
  useTransactionPayFiatPaymentMock.mockReturnValue(undefined);

  useTransactionPayWithdrawMock.mockReturnValue({
    isWithdraw: false,
    canSelectWithdrawToken: false,
  });

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
  });

  useTransactionCustomAmountMock.mockReturnValue(createCustomAmountMock());

  useConfirmationContextMock.mockReturnValue({
    mmPayRequestInProgressNavHandler: { current: false },
    headlessBuyError: undefined,
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

  useAlertsMock.mockReturnValue({
    alerts: [] as Alert[],
    generalAlerts: [] as Alert[],
    fieldAlerts: [] as Alert[],
  } as AlertsContextParams);

  useTransactionCustomAmountAlertsMock.mockReturnValue({});

  useAccountTokensMock.mockReturnValue([]);
  useTransactionPayAvailableTokensMock.mockReturnValue({
    availableTokens: [{}] as AssetType[],
    hasTokens: true,
  });
  useTransactionPayRequiredTokensMock.mockReturnValue([]);
  useConfirmActionsMock.mockReturnValue({
    onConfirm: jest.fn(),
    onReject: jest.fn(),
  });
  useIsTransactionPayLoadingMock.mockReturnValue(false);
  useTransactionPayQuotesMock.mockReturnValue([]);
  useTransactionPayQuotesLastUpdatedMock.mockReturnValue(undefined);
  useTransactionPayPrimaryRequiredTokenMock.mockReturnValue({
    amountRaw: '1000',
  } as ReturnType<typeof useTransactionPayPrimaryRequiredToken>);
  useTokenFiatRatesMock.mockReturnValue([1, 1]);
  useTransactionMetadataRequestMock.mockReturnValue({
    type: TransactionType.contractInteraction,
    txParams: { from: '0x123' },
  } as never);

  useMoneyNoFeeTokensMock.mockReturnValue({ isMoneyNoFeeToken: false });
  usePayWithMoneyAccountSectionMock.mockReturnValue(null);
  useAccountNoFundsAlertMock.mockReturnValue([]);
  useTransactionPayAccountLoadingMock.mockReturnValue(false);

  setControllerTransactions([]);
}
