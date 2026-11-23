import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { PaymentOverride } from '@metamask/transaction-pay-controller';
import { Metrics } from 'react-native-safe-area-context';
import {
  usePerpsLiveAccount,
  usePerpsLiquidationPrice,
  usePerpsMarketData,
  usePerpsNetwork,
  usePerpsOrderDepositTracking,
  usePerpsOrderExecution,
  usePerpsOrderForm,
  usePerpsOrderValidation,
  usePerpsPrices,
  usePerpsRewards,
  usePerpsTrading,
  usePerpsToasts,
  useMinimumOrderAmount,
} from '../../hooks';
import {
  usePerpsLivePositions,
  usePerpsLivePrices,
  usePerpsTopOfBook,
} from '../../hooks/stream';
import { usePerpsEstimatedSlippage } from '../../hooks/usePerpsEstimatedSlippage';
import { usePerpsMaxSlippage } from '../../hooks/usePerpsMaxSlippage';
import {
  PerpsStreamManager,
  PerpsStreamProvider,
} from '../../providers/PerpsStreamManager';
import { usePerpsOrderContext } from '../../contexts/PerpsOrderContext';
import { useAnalytics } from '../../../../../components/hooks/useAnalytics/useAnalytics';
import { isHardwareAccount } from '../../../../../util/address';
import { useTransactionConfirm } from '../../../../Views/confirmations/hooks/transactions/useTransactionConfirm';

// Local reanimated mock needed: Reanimated.default.call override is required
// for RewardsAnimations component rendering.
jest.mock('react-native-reanimated', () => {
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  Reanimated.default.call = () => undefined;
  return Reanimated;
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  return {
    GestureHandlerRootView: RN.View,
    RectButton: RN.TouchableOpacity,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: {
      Pan: jest.fn().mockReturnValue({
        onUpdate: jest.fn().mockReturnThis(),
        onEnd: jest.fn().mockReturnThis(),
      }),
    },
  };
});

// Mock react-native-linear-gradient
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('images/image-icons', () => ({ __esModule: true, default: {} }), {
  virtual: true,
});

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: jest.fn(),
    useRoute: jest.fn(),
    useFocusEffect: jest.fn((callback) => callback()),
  };
});

jest.mock('../../../../../util/address', () => ({
  ...jest.requireActual('../../../../../util/address'),
  isHardwareAccount: jest.fn(),
}));

// Mock i18n strings
jest.mock('../../../../../../locales/i18n', () => ({
  strings: jest.fn((key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'perps.order.leverage': 'Leverage',
      'perps.order.limit_price': 'Limit price',
      'perps.order.tp_sl': 'TP/SL',
      'perps.order.margin': 'Margin',
      'perps.order.liquidation_price': 'Liquidation price',
      'perps.order.fees': 'Fees',
      'perps.order.off': 'off',
      'perps.order.tp': 'TP',
      'perps.order.sl': 'SL',
      'perps.order.button.long': 'Long {{asset}}',
      'perps.order.button.short': 'Short {{asset}}',
      'perps.market.long': 'Long',
      'perps.market.short': 'Short',
      'perps.order.validation.insufficient_funds': 'Insufficient funds',
      'perps.deposit.max_button': 'Max',
      'perps.deposit.done_button': 'Done',
      'perps.errors.orderValidation.sizePositive':
        'Size must be a positive number',
      'perps.tpsl.stop_loss_order_view_warning':
        'Stop loss is {{direction}} liquidation price',
      'perps.tpsl.take_profit_wrong_side_warning':
        'Take profit must be {{direction}} {{priceType}} price. Update or clear it to place the order.',
      'perps.tpsl.stop_loss_wrong_side_warning':
        'Stop loss must be {{direction}} {{priceType}} price. Update or clear it to place the order.',
      'perps.tpsl.below': 'below',
      'perps.tpsl.above': 'above',
      'perps.points': 'Points',
      'perps.estimated_points': 'perps.estimated_points',
      'perps.points_error': 'Points Error',
      'perps.points_error_content': 'Unable to load points at this time',
    };

    if (params && translations[key]) {
      let result = translations[key];
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{{${paramKey}}}`, String(paramValue));
      });
      return result;
    }

    return translations[key] || key;
  }),
}));

// Mock the context. `usePerpsOrderContext` is stubbed, so the balance the view
// feeds into the order form is only observable on the provider — capture it.
let mockProviderEffectiveAvailableBalance: number | undefined;
jest.mock('../../contexts/PerpsOrderContext', () => {
  const ReactActual = jest.requireActual('react');
  const actual = jest.requireActual('../../contexts/PerpsOrderContext');
  return {
    ...actual,
    usePerpsOrderContext: jest.fn(),
    PerpsOrderProvider: (props: { effectiveAvailableBalance?: number }) => {
      mockProviderEffectiveAvailableBalance = props.effectiveAvailableBalance;
      return ReactActual.createElement(actual.PerpsOrderProvider, props);
    },
  };
});

// Mock stream hooks - these will be overridden in beforeEach
jest.mock('../../hooks/stream', () => ({
  usePerpsLiveAccount: jest.fn(() => ({
    account: {
      spendableBalance: '1000',
      withdrawableBalance: '1000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
      totalBalance: '1000',
    },
    isInitialLoading: false,
  })),
  usePerpsLivePositions: jest.fn(() => ({
    positions: [],
    isInitialLoading: false,
  })),
  usePerpsLivePrices: jest.fn(() => ({
    ETH: { price: '3000', percentChange24h: '2.5', markPrice: '3000' },
    BTC: { price: '3000', percentChange24h: '2.5', markPrice: '3000' },
  })),
  usePerpsTopOfBook: jest.fn(() => ({
    bid: '2999',
    ask: '3001',
  })),
  usePerpsLiveFocusedPrice: jest.fn(() => undefined),
}));

jest.mock('../../utils/perpsAnalyticsAttribution', () => ({
  ...jest.requireActual('../../utils/perpsAnalyticsAttribution'),
  getPerpsUtmAttributionProperties: jest.fn(() => ({})),
}));

jest.mock('../../hooks/usePerpsNetworkManagement', () => ({
  usePerpsNetworkManagement: () => ({
    ensureArbitrumNetworkExists: jest.fn().mockResolvedValue(undefined),
    enableArbitrumNetwork: jest.fn(),
    getArbitrumChainId: jest.fn(),
    currentNetwork: 'mainnet',
  }),
}));

// Default return values for hooks that individual tests override.
// jest.clearAllMocks() keeps implementations, so beforeEach must re-apply these.
// mock* prefix is required so jest.mock factories can call them after hoist.
export const mockDefaultUsePerpsOrderForm = () => ({
  orderForm: {
    asset: 'ETH',
    amount: '11',
    leverage: 3,
    direction: 'long',
    type: 'market',
    limitPrice: undefined,
    takeProfitPrice: undefined,
    stopLossPrice: undefined,
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
  optimizeOrderAmount: jest.fn(),
  maxPossibleAmount: 1000,
  setEstimatedFeeRate: jest.fn(),
  balanceForValidation: 1000,
  calculations: {
    marginRequired: 11,
    positionSize: 0.0037,
  },
});

export const mockDefaultUsePerpsOrderExecution = () => ({
  placeOrder: jest.fn().mockResolvedValue({ success: true }),
  isPlacing: false,
});

export const mockDefaultUsePerpsRewards = () => ({
  shouldShowRewardsRow: false,
  isLoading: false,
  estimatedPoints: undefined,
  bonusBips: undefined,
  feeDiscountPercentage: undefined,
  hasError: false,
  isRefresh: false,
  accountOptedIn: null,
  account: undefined,
});

export const mockDefaultUsePerpsToasts = () => ({
  showToast: jest.fn(),
  PerpsToastOptions: {
    formValidation: {
      orderForm: {
        limitPriceRequired: {},
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
});

export const mockDefaultUsePerpsEstimatedSlippage = () => ({
  estimatedSlippageBps: null,
  isReady: false,
});

export const mockDefaultUsePerpsMaxSlippage = () => ({
  maxSlippageBps: 300,
  maxSlippageSource: 'default',
  setMaxSlippage: jest.fn(),
});

// Mock the hooks module - these will be overridden in beforeEach
jest.mock('../../hooks', () => {
  const { usePerpsEventTracking } = jest.requireActual(
    '../../hooks/usePerpsEventTracking',
  );

  return {
    useBottomSafeAreaInset: jest.fn(() => 0),
    usePerpsLiveAccount: jest.fn(),
    usePerpsTrading: jest.fn(),
    usePerpsNetwork: jest.fn(),
    usePerpsNetworkManagement: jest.fn(() => ({
      ensureArbitrumNetworkExists: jest.fn().mockResolvedValue(undefined),
      enableArbitrumNetwork: jest.fn(),
      getArbitrumChainId: jest.fn(),
      currentNetwork: 'mainnet',
    })),
    usePerpsPrices: jest.fn(),
    usePerpsLivePrices: jest.fn(() => ({
      ETH: { price: '3000', percentChange24h: '2.5' },
      BTC: { price: '3000', percentChange24h: '2.5' },
    })),
    usePerpsPaymentTokens: jest.fn(() => [
      {
        symbol: 'USDC',
        address: '0xusdc',
        decimals: 6,
        balance: '1000000000',
        balanceFiat: '$1000.00',
        chainId: '0x1',
        name: 'USD Coin',
      },
    ]),
    usePerpsConnection: jest.fn(() => ({
      isConnected: true,
      isConnecting: false,
      isInitialized: true,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
      resetError: jest.fn(),
    })),
    usePerpsMarketData: jest.fn(),
    usePerpsLiquidationPrice: jest.fn(),
    usePerpsQuotedFeeReservation: jest.fn(),
    usePerpsFeeDisplayAbTest: jest.fn(() => ({
      feeDisplayMode: 'dollar',
      variantName: 'control',
      isActive: false,
    })),
    usePerpsOrderFees: jest.fn(() => ({
      totalFee: 45,
      undiscountedTotalFee: 45,
      protocolFee: 45,
      metamaskFee: 0,
      totalFeeRate: 0.00045,
      protocolFeeRate: 0.00045,
      metamaskFeeRate: 0,
      isLoadingMetamaskFee: false,
      error: null,
    })),
    formatFeeRate: jest.fn((rate) => `${(rate * 100).toFixed(3)}%`),
    usePerpsOrderForm: jest.fn(() => mockDefaultUsePerpsOrderForm()),
    usePerpsOrderValidation: jest.fn(() => ({
      isValid: true,
      errors: [],
      warnings: [],
      fieldIssues: [],
      isValidating: false,
      insufficientBalanceErrors: [],
      validateNow: jest.fn(),
    })),
    usePerpsOrderExecution: jest.fn(() => mockDefaultUsePerpsOrderExecution()),
    usePerpsOrderDepositTracking: jest.fn(() => ({
      handleDepositConfirm: jest.fn(),
    })),
    useHasExistingPosition: jest.fn(() => ({
      hasPosition: false,
      isLoading: false,
      error: null,
    })),
    useMinimumOrderAmount: jest.fn(() => ({
      minimumOrderAmount: 10,
      isLoading: false,
      error: null,
    })),
    usePerpsMarkets: jest.fn(() => ({
      markets: [
        {
          name: 'ETH',
          symbol: 'ETH-USD',
          priceDecimals: 2,
          sizeDecimals: 4,
          maxLeverage: 50,
          minSize: 0.01,
          sizeIncrement: 0.01,
        },
        {
          name: 'BTC',
          symbol: 'BTC-USD',
          priceDecimals: 2,
          sizeDecimals: 6,
          maxLeverage: 50,
          minSize: 0.001,
          sizeIncrement: 0.001,
        },
      ],
      isLoading: false,
      error: null,
    })),
    usePerpsEventTracking,
    usePerpsRewards: jest.fn(() => mockDefaultUsePerpsRewards()),
    usePerpsToasts: jest.fn(() => mockDefaultUsePerpsToasts()),
  };
});

// Mock direct hook imports (when imported from specific file paths)
jest.mock('../../hooks/usePerpsConnection', () => ({
  usePerpsConnection: jest.fn(() => ({
    isConnected: true,
    isConnecting: false,
    isInitialized: true,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    resetError: jest.fn(),
  })),
}));

jest.mock('../../hooks/usePerpsPaymentTokens', () => ({
  usePerpsPaymentTokens: jest.fn(() => [
    {
      symbol: 'USDC',
      address: '0xusdc',
      decimals: 6,
      balance: '1000000000',
      balanceFiat: '$1000.00',
      chainId: '0x1',
      name: 'USD Coin',
    },
  ]),
}));

export const mockUseIsPerpsBalanceSelected = jest.fn<boolean, unknown[]>(
  () => false,
);
jest.mock('../../hooks/useIsPerpsBalanceSelected', () => ({
  useIsPerpsBalanceSelected: (...args: unknown[]) =>
    mockUseIsPerpsBalanceSelected(...args),
  usePerpsPayWithToken: jest.fn(() => null),
}));

jest.mock('../../../../Views/confirmations/hooks/tokens/useAddToken', () => ({
  useAddToken: jest.fn(),
}));

jest.mock(
  '../../../../Views/confirmations/hooks/transactions/useTransactionMetadataRequest',
  () => ({
    useTransactionMetadataRequest: jest.fn(() => ({
      id: 'test-transaction-id',
      type: 'perpsDeposit',
      status: 'unapproved',
      chainId: '0xa4b1',
      txParams: {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        value: '0x0',
      },
    })),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/transactions/useTransactionConfirm',
  () => ({
    useTransactionConfirm: jest.fn(() => ({
      onConfirm: jest.fn(),
    })),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/ui/useClearConfirmationOnBackSwipe',
  () => ({
    __esModule: true,
    default: jest.fn(),
  }),
);

jest.mock('../../../../Views/confirmations/hooks/useConfirmActions', () => ({
  useConfirmActions: jest.fn(() => ({
    onConfirm: jest.fn(),
    onReject: jest.fn().mockResolvedValue(undefined),
  })),
}));

export const mockRejectBeforeForm = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../Views/confirmations/hooks/useConfirmReject', () => ({
  useConfirmReject: () => ({ onReject: mockRejectBeforeForm }),
}));

jest.mock(
  '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
  () => ({
    useInsufficientPayTokenBalanceAlert: jest.fn(() => []),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
  () => ({
    useNoPayTokenQuotesAlert: jest.fn(() => []),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/pay/useAutomaticTransactionPayToken',
  () => ({
    useAutomaticTransactionPayToken: jest.fn(),
  }),
);

export const mockUseTransactionPayToken = jest.fn<
  {
    payToken: Record<string, unknown> | undefined;
    setPayToken: jest.Mock;
    isNative: boolean | undefined;
  },
  unknown[]
>(() => ({
  payToken: undefined,
  setPayToken: jest.fn(),
  isNative: undefined,
}));
jest.mock(
  '../../../../Views/confirmations/hooks/pay/useTransactionPayToken',
  () => ({
    useTransactionPayToken: (...args: unknown[]) =>
      mockUseTransactionPayToken(...args),
  }),
);

// Live wallet balance for the selected pay token, independent of the stale
// `payToken.balanceUsd` controller snapshot.
let mockPayTokenAccountBalanceUsd = '0';
jest.mock(
  '../../../../Views/confirmations/hooks/pay/usePayTokenOrMoneyAccountBalance',
  () => ({
    usePayTokenOrMoneyAccountBalance: () => ({
      balanceUsd: mockPayTokenAccountBalanceUsd,
      balanceRaw: '0',
    }),
  }),
);

export const mockUseMoneyAccountDepositAndOrder = jest.fn();
jest.mock(
  '../../../../Views/confirmations/hooks/pay/useMoneyAccountDepositAndOrder',
  () => ({
    useMoneyAccountDepositAndOrder: (...args: unknown[]) =>
      mockUseMoneyAccountDepositAndOrder(...args),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/pay/useTransactionPayMetrics',
  () => ({
    useTransactionPayMetrics: jest.fn(),
  }),
);

export const mockSetConfirmationMetric = jest.fn();
jest.mock(
  '../../../../Views/confirmations/hooks/metrics/useConfirmationMetricEvents',
  () => ({
    useConfirmationMetricEvents: jest.fn(() => ({
      setConfirmationMetric: mockSetConfirmationMetric,
    })),
  }),
);

// Controllable pay-quote state for the trade-quote-received coverage tests.
let mockIsPayQuoteLoading = false;
let mockPayTotals: unknown;
let mockPayRequiredTokens: {
  amountRaw: string;
  skipIfBalance: boolean;
}[] = [];
let mockIsPaySubmitReady = true;
jest.mock(
  '../../../../Views/confirmations/hooks/pay/useTransactionPayData',
  () => ({
    ...jest.requireActual(
      '../../../../Views/confirmations/hooks/pay/useTransactionPayData',
    ),
    useIsTransactionPayQuoteLoading: () => mockIsPayQuoteLoading,
    useTransactionPayTotals: () => mockPayTotals,
    useTransactionPayRequiredTokens: () => mockPayRequiredTokens,
    useIsTransactionPaySubmitReady: () => mockIsPaySubmitReady,
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/transactions/useTransactionCustomAmount',
  () => ({
    useTransactionCustomAmount: jest.fn(() => ({
      amountFiat: '0',
      amountHuman: '0',
      amountHumanDebounced: '0',
      hasInput: false,
      isInputChanged: false,
      updatePendingAmount: jest.fn(),
      updatePendingAmountPercentage: jest.fn(),
      updateTokenAmount: jest.fn(),
    })),
  }),
);

jest.mock(
  '../../../../Views/confirmations/hooks/transactions/useUpdateTokenAmount',
  () => ({
    useUpdateTokenAmount: jest.fn(() => ({
      updateTokenAmount: jest.fn(),
    })),
  }),
);

// Mock tokensController selectors
jest.mock('../../../../../selectors/tokensController', () => ({
  ...jest.requireActual('../../../../../selectors/tokensController'),
  selectTokensByChainIdAndAddress: jest.fn(() => ({})),
}));

// Mock accountTreeController selectors
jest.mock(
  '../../../../../selectors/multichainAccounts/accountTreeController',
  () => ({
    ...jest.requireActual(
      '../../../../../selectors/multichainAccounts/accountTreeController',
    ),
    selectSelectedAccountGroupInternalAccounts: jest.fn((_state) => []),
  }),
);

let mockPerpsAdvancedChartEnabled = false;
let mockPaymentOverride: PaymentOverride | undefined;
let mockTradeWithAnyTokenEnabled = false;
let mockPerpsSizeDenomination: 'usd' | 'asset' = 'usd';
let mockSelectedEvmAccount: { address: string } | undefined;
let mockIsPerpsProModeActive = false;
export const mockResolvePostTradePrompt = jest.fn();
export const mockCanShareCopyTrade = jest.fn(() => true);

jest.mock(
  '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/usePostTradePromptResolver',
  () => ({
    usePostTradePromptResolver: () => mockResolvePostTradePrompt,
    useCanShareCopyTrade: () => mockCanShareCopyTrade,
  }),
);

jest.mock('../../utils/perpsModeSwitch', () => ({
  ...jest.requireActual('../../utils/perpsModeSwitch'),
  useIsPerpsProModeActive: () => mockIsPerpsProModeActive,
}));

jest.mock('../../../../../util/social/postTradePromptStorage', () => ({
  incrementShareSheetCount: jest.fn(),
  markClaimSheetSeen: jest.fn(),
}));

jest.mock(
  '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/postTradeComposerParams',
  () => ({
    ...jest.requireActual(
      '../../../../Views/SocialLeaderboard/PostTradeShareBottomSheet/postTradeComposerParams',
    ),
    openPostTradeComposer: jest.fn(),
  }),
);

// Mock Redux selectors and dispatch (PerpsOrderView dispatches resetTransaction on unmount)
jest.mock('react-redux', () => {
  const orderBookByUnit = {
    usd: { currency: 'usd', metric: 'total' },
    asset: { currency: 'base', metric: 'total' },
  };

  return {
    ...jest.requireActual('react-redux'),
    useDispatch: jest.fn(() => jest.fn()),
    useSelector: jest.fn((selector) => {
      // reselect selectors do not carry their export name in `toString()`, so
      // match this one by identity.
      const { selectPerpsTradeWithAnyTokenEnabledFlag } = jest.requireActual(
        '../../selectors/featureFlags',
      );
      const { selectPerpsOrderBookPreferences } = jest.requireActual(
        '../../selectors/perpsController',
      );
      if (selector === selectPerpsTradeWithAnyTokenEnabledFlag) {
        return mockTradeWithAnyTokenEnabled;
      }
      if (selector === selectPerpsOrderBookPreferences) {
        return orderBookByUnit[mockPerpsSizeDenomination];
      }
      const { selectSelectedInternalAccountByScope } = jest.requireActual(
        '../../../../../selectors/multichainAccounts/accounts',
      );
      if (selector === selectSelectedInternalAccountByScope) {
        return () => mockSelectedEvmAccount;
      }
      if (
        selector.toString().includes('selectPerpsAdvancedChartEnabledFlag') ||
        selector.toString().includes('perpsAdvancedChart')
      ) {
        return mockPerpsAdvancedChartEnabled;
      }
      if (selector.toString().includes('selectTokenList')) {
        return {};
      }
      if (selector.toString().includes('selectIsIpfsGatewayEnabled')) {
        return false;
      }
      if (
        selector.toString().includes('selectPaymentOverrideByTransactionId')
      ) {
        return mockPaymentOverride;
      }
      if (selector.toString().includes('selectTokensByChainIdAndAddress')) {
        return {};
      }
      if (
        selector
          .toString()
          .includes('selectSelectedAccountGroupInternalAccounts')
      ) {
        return [];
      }
      return null;
    }),
  };
});

// Rewards feature flag removed - rewards are always enabled

// Mock DevLogger (module appears to use default export with .log())
jest.mock('../../../../../core/SDKConnect/utils/DevLogger', () => {
  const log = jest.fn();
  return {
    __esModule: true,
    default: { log },
    DevLogger: { log }, // provide named export fallback if implementation changes
  };
});

jest.mock('../../../../../util/haptics');

// Mock trace utilities
jest.mock('../../../../../util/trace', () => ({
  trace: jest.fn(),
  endTrace: jest.fn(),
  TraceName: {
    PerpsOrderView: 'Perps Order View',
    PerpsTradeSheetInteractive: 'Perps Trade Sheet Interactive',
  },
  TraceOperation: {
    UIStartup: 'ui.startup',
    PerpsOperation: 'perps.operation',
  },
}));

export const mockTrackEvent = jest.fn();
export const mockCreateEventBuilder = jest.fn(() => ({
  addProperties: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({}),
}));
jest.mock('../../../../../components/hooks/useAnalytics/useAnalytics');

// Mock Engine context to prevent accessing real PerpsController
jest.mock('../../../../../core/Engine', () => ({
  controllerMessenger: { call: jest.fn() },
  context: {
    PerpsController: {
      subscribeToPrices: jest.fn(() => jest.fn()),
      getAccountState: jest.fn().mockResolvedValue({
        totalBalance: '1000',
        spendableBalance: '1000',
        withdrawableBalance: '1000',
        marginUsed: '0',
        unrealizedPnl: '0',
      }),
      placeOrder: jest.fn().mockResolvedValue({ success: true }),
      savePendingTradeConfiguration: jest.fn(),
      clearPendingTradeConfiguration: jest.fn(),
    },
  },
}));

// Mock useTooltipModal hook
jest.mock('../../../../hooks/useTooltipModal', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    openTooltipModal: jest.fn(),
  })),
}));

// Value the slider stub drags to. Tests set this before firing the drag
// testIDs below so the real onValueChange/onDragEnd wiring runs with a
// controllable value.
let mockSliderDragValue = 0;

// Mock PerpsSlider since it uses reanimated which needs special handling in
// tests. Exposes drag/drag-end testIDs so tests can exercise the real
// commit-funnel wiring (handleSliderValueChange/handleSliderDragEnd) instead
// of only checking that the slider renders.
jest.mock('../../components/PerpsSlider', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    onDragEnd,
  }: {
    value: number;
    onValueChange: (v: number) => void;
    onDragEnd?: (v: number) => void;
  }) => {
    const { View, Text, TouchableOpacity } = jest.requireActual('react-native');
    return (
      <View testID="perps-slider">
        <Text>Slider Value: {value}</Text>
        <TouchableOpacity
          testID="perps-slider-drag"
          onPress={() => onValueChange(mockSliderDragValue)}
        />
        <TouchableOpacity
          testID="perps-slider-drag-end"
          onPress={() => onDragEnd?.(mockSliderDragValue)}
        />
      </View>
    );
  },
}));

// Mock notifications utility
jest.mock('../../../../../util/notifications', () => ({
  ...jest.requireActual('../../../../../util/notifications'),
  isNotificationsFeatureEnabled: jest.fn(() => true),
}));

// Mock PerpsNotificationTooltip
jest.mock('../../components/PerpsNotificationTooltip', () => {
  const MockReact = jest.requireActual('react');
  return {
    __esModule: true,
    default: ({
      orderSuccess,
      onComplete,
      testID,
    }: {
      orderSuccess: boolean;
      onComplete: () => void;
      testID: string;
    }) =>
      orderSuccess
        ? MockReact.createElement(
            'View',
            {
              testID,
              onPress: onComplete,
            },
            'Notification Tooltip',
          )
        : null,
  };
});

// Mock network utils - spread actual to satisfy transitive deps (e.g. stakeableTokens.getDecimalChainId), override only what we need
jest.mock('../../../../../util/networks', () => ({
  ...jest.requireActual('../../../../../util/networks'),
  getDefaultNetworkByChainId: jest.fn(() => ({ name: 'Arbitrum' })),
  getNetworkImageSource: jest.fn(() => ({ uri: 'network-icon' })),
}));

// Consolidated mock for bottom sheet components (not PerpsTPSLView - it's now a navigation screen)
export const createBottomSheetMock = (testId: string) => {
  const MockReact = jest.requireActual('react');
  return {
    __esModule: true,
    default: ({ isVisible }: { isVisible: boolean }) =>
      isVisible ? MockReact.createElement('View', { testID: testId }) : null,
  };
};

// Leverage the stub confirms with when tests press the confirm testID below.
let mockLeverageConfirmValue = 3;

// Lightweight stub so tests can confirm a leverage through the real
// onConfirm wiring (clamp/flush logic) without depending on the real
// BottomSheet internals. Keeps the same 'leverage-bottom-sheet' testID as
// the generic mock so existing visibility assertions keep working.
jest.mock('../../components/PerpsLeverageBottomSheet', () => {
  const MockReact = jest.requireActual('react');
  const { TouchableOpacity } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      isVisible,
      onConfirm,
    }: {
      isVisible: boolean;
      onConfirm: (leverage: number, inputMethod: string) => void;
    }) =>
      isVisible
        ? MockReact.createElement(
            TouchableOpacity,
            {
              testID: 'leverage-bottom-sheet',
              onPress: () => onConfirm(mockLeverageConfirmValue, 'slider'),
            },
            null,
          )
        : null,
  };
});
jest.mock('../../components/PerpsLimitPriceBottomSheet', () =>
  createBottomSheetMock('limit-price-bottom-sheet'),
);
jest.mock('../../components/PerpsOrderTypeBottomSheet', () =>
  createBottomSheetMock('order-type-bottom-sheet'),
);
jest.mock('../../components/PerpsBottomSheetTooltip', () =>
  createBottomSheetMock('perps-order-view-bottom-sheet-tooltip'),
);
export const mockPerpsRebateBanner = jest.fn(
  (_props: Record<string, unknown>) => null,
);
jest.mock('../../components/PerpsRebateBanner', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockPerpsRebateBanner(props),
}));

export interface MockTradeScreenProps {
  orderType: 'market' | 'limit';
  limitPrice?: string;
  limitPriceWarning?: string;
  isLimitPriceFocused: boolean;
  autoCloseText: string;
  showAutoClose: boolean;
  margin: string;
  payWithName: string;
  payWithBalance: string;
  showPayWith: boolean;
  isPayWithDisabled: boolean;
  isPayWithLoading: boolean;
  feePercentage?: string;
  bridgeFee?: string;
  isFeeLoading: boolean;
  isSubmitDisabled: boolean;
  hasAmountError: boolean;
  showAmountWarning: boolean;
  errorMessages: { key: string; message: React.ReactNode }[];
  onSliderValueChange: (value: number) => void;
  onLimitPriceKeypadChange: (value: {
    value: string;
    valueAsNumber: number;
  }) => void;
  onLimitPricePresetPress: (
    preset: 'mid' | 'book' | 'percentage-1' | 'percentage-2',
  ) => void;
  onLimitPriceDonePress: () => void;
  onOrderTypeToggle: () => void;
  onPayWithPress: () => void;
  maxLeverage: number | null;
  liquidationPrice: string;
  liquidationDistance?: string;
  isLiquidationLoading: boolean;
  onSubmit: () => void | Promise<void>;
}

export interface MockLeverageScreenProps {
  maxLeverage: number;
  onConfirm: (leverage: number, inputMethod?: string) => void;
}

export interface MockTPSLScreenProps {
  initialTakeProfitPrice?: string;
  initialStopLossPrice?: string;
  onSave: (takeProfitPrice?: string, stopLossPrice?: string) => void;
}

export interface MockInfoScreenProps {
  contentKey: string;
}

export interface MockPayWithScreenProps {
  onDismiss: () => void;
}

let mockTradeScreenProps: MockTradeScreenProps | undefined;
let mockTradeSheetOnClose: (() => void) | undefined;
let mockTradeSheetContentSizedScreens: readonly string[] | undefined;
let mockLeverageScreenProps: MockLeverageScreenProps | undefined;
let mockTPSLScreenProps: MockTPSLScreenProps | undefined;
let mockPayWithScreenProps: MockPayWithScreenProps | undefined;
let mockMarginInfoScreenProps: MockInfoScreenProps | undefined;
let mockLiquidationInfoScreenProps: MockInfoScreenProps | undefined;

export const getMockTradeScreenProps = (): MockTradeScreenProps => {
  if (!mockTradeScreenProps) {
    throw new Error('Trade screen did not render');
  }
  return mockTradeScreenProps;
};

export const getMockLeverageScreenProps = (): MockLeverageScreenProps => {
  if (!mockLeverageScreenProps) {
    throw new Error('Leverage screen did not render');
  }
  return mockLeverageScreenProps;
};

export const getMockTPSLScreenProps = (): MockTPSLScreenProps => {
  if (!mockTPSLScreenProps) {
    throw new Error('TP/SL screen did not render');
  }
  return mockTPSLScreenProps;
};

export const getMockPayWithScreenProps = (): MockPayWithScreenProps => {
  if (!mockPayWithScreenProps) {
    throw new Error('Pay with screen did not render');
  }
  return mockPayWithScreenProps;
};

jest.mock(
  '../../components/PerpsTradeBottomSheet/PerpsTradeBottomSheet',
  () => {
    const ReactActual = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return {
      __esModule: true,
      default: ({
        onClose,
        screens,
        contentSizedScreens,
      }: {
        onClose: () => void;
        screens: Record<string, React.ReactNode>;
        contentSizedScreens?: readonly string[];
      }) => {
        mockTradeSheetOnClose = onClose;
        mockTradeSheetContentSizedScreens = contentSizedScreens;
        mockTradeScreenProps = (
          screens.trade as React.ReactElement<MockTradeScreenProps>
        ).props;
        mockLeverageScreenProps = (
          screens.leverage as React.ReactElement<MockLeverageScreenProps>
        ).props;
        mockTPSLScreenProps = (
          screens.tpsl as React.ReactElement<MockTPSLScreenProps>
        ).props;
        mockPayWithScreenProps = (
          screens.payWith as React.ReactElement<MockPayWithScreenProps>
        ).props;
        mockMarginInfoScreenProps = (
          screens.marginInfo as React.ReactElement<MockInfoScreenProps>
        ).props;
        mockLiquidationInfoScreenProps = (
          screens.liquidationInfo as React.ReactElement<MockInfoScreenProps>
        ).props;
        return ReactActual.createElement(View, {
          testID: 'perps-trade-sheet',
        });
      },
      PerpsTradeSheetFrame: ({ children }: { children: React.ReactNode }) =>
        children,
      PerpsTradeSheetPlaceholder: ({ onLayout }: { onLayout: () => void }) => {
        ReactActual.useEffect(() => {
          onLayout();
        }, [onLayout]);
        return ReactActual.createElement(View, {
          testID: 'perps-trade-sheet-placeholder',
        });
      },
    };
  },
);

// The mocked sheet only reads the nested screens' props and never renders
// them; the real module pulls in the confirmations pay-with sections and the
// PredictNext navigator.
jest.mock(
  '../../components/PerpsTradeBottomSheet/PerpsTradeNestedScreens',
  () => ({
    PerpsTradeInfoScreen: () => null,
    PerpsTradeLeverageScreen: () => null,
    PerpsTradePayWithScreen: () => null,
    PerpsTradeTPSLScreen: () => null,
  }),
);

// Mock AddRewardsAccount component
jest.mock(
  '../../../Rewards/components/AddRewardsAccount/AddRewardsAccount',
  () => {
    const ReactActual = jest.requireActual('react');
    const { View, Text } = jest.requireActual('react-native');
    return {
      __esModule: true,
      default: ({ account }: { account?: unknown }) =>
        account
          ? ReactActual.createElement(
              View,
              { testID: 'add-rewards-account' },
              ReactActual.createElement(Text, {}, 'Add Rewards Account'),
            )
          : null,
    };
  },
);

jest.mock('../../hooks/usePerpsEstimatedSlippage', () => ({
  usePerpsEstimatedSlippage: jest.fn(() =>
    mockDefaultUsePerpsEstimatedSlippage(),
  ),
}));

jest.mock('../../hooks/usePerpsMaxSlippage', () => ({
  usePerpsMaxSlippage: jest.fn(() => mockDefaultUsePerpsMaxSlippage()),
}));

// Test setup
export const mockNavigate = jest.fn();
export const mockGoBack = jest.fn();
export const mockParentGoBack = jest.fn();
export const mockParentCanGoBack = jest.fn(() => true);

export const defaultMockRoute = {
  params: {
    asset: 'ETH',
    action: 'long',
  },
};

export const useTradeSheetRoute = (
  params: Record<string, unknown> = {},
): void => {
  (useRoute as jest.Mock).mockReturnValue({
    params: {
      asset: 'ETH',
      direction: 'long',
      useBottomSheet: true,
      ...params,
    },
  });
};

export const defaultMockHooks = {
  usePerpsLiveAccount: {
    account: {
      spendableBalance: '1000',
      withdrawableBalance: '1000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
      totalBalance: '1000',
    },
    isInitialLoading: false,
  },
  usePerpsTrading: {
    placeOrder: jest.fn(),
    depositWithConfirmation: jest.fn().mockResolvedValue(undefined),
    withdrawWithConfirmation: jest.fn(),
    subscribeToPrices: jest.fn(() => jest.fn()),
    getMarkets: jest.fn().mockResolvedValue([
      {
        name: 'ETH',
        symbol: 'ETH-USD',
        priceDecimals: 2,
        sizeDecimals: 4,
        maxLeverage: 50,
        minSize: 0.01,
        sizeIncrement: 0.01,
      },
    ]),
    getMarketInfo: jest.fn().mockResolvedValue({
      name: 'ETH',
      symbol: 'ETH-USD',
      priceDecimals: 2,
      sizeDecimals: 4,
    }),
    calculateLiquidationPrice: jest.fn().mockResolvedValue('2850.00'),
  },
  usePerpsNetwork: 'mainnet',
  usePerpsPrices: {
    ETH: {
      price: '3000',
      percentChange24h: '2.5',
    },
  },
  usePerpsPaymentTokens: [
    {
      symbol: 'USDC',
      address: '0xusdc',
      decimals: 6,
      balance: '1000000000',
      chainId: '0x1',
      name: 'USD Coin',
    },
  ],
  usePerpsOrderContext: {
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
  },
};

// Mock stream manager for tests
export const createMockStreamManager = () => {
  // Using Map to track subscribers for potential cleanup
  const subscribers = new Map<string, (data: unknown) => void>();
  let subscriberIdCounter = 0;

  return {
    prices: {
      subscribeToSymbols: ({
        symbols,
        callback,
      }: {
        symbols: string[];
        callback: (data: unknown) => void;
      }) => {
        const id = String(subscriberIdCounter++);
        subscribers.set(id, callback);
        // Immediately provide mock price data
        const mockPrices: Record<string, unknown> = {};
        symbols.forEach((symbol: string) => {
          mockPrices[symbol] = {
            price: '3000',
            percentChange24h: '2.5',
          };
        });
        callback(mockPrices);
        return () => {
          subscribers.delete(id);
        };
      },
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
      getSnapshotForSymbol: jest.fn(() => null),
    },
    focusedPrice: {
      getSnapshot: jest.fn(() => null),
      subscribeToSymbol: jest.fn(() => jest.fn()),
    },
    candles: {
      getCachedData: jest.fn(() => null),
      isChartCacheFresh: jest.fn(() => false),
    },
    orders: {
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
    },
    positions: {
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
    },
    fills: {
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
    },
    account: {
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
    },
    topOfBook: {
      subscribeToSymbol: ({
        symbol: _symbol,
        callback,
      }: {
        symbol: string;
        callback: (data: unknown) => void;
      }) => {
        const id = String(subscriberIdCounter++);
        subscribers.set(id, callback);
        // Immediately provide mock top of book data
        const mockTopOfBook = {
          bestBid: '2999',
          bestAsk: '3001',
          spread: '2',
        };
        callback(mockTopOfBook);
        return () => {
          subscribers.delete(id);
        };
      },
      getSnapshot: jest.fn(() => null),
    },
    marketData: {
      subscribe: jest.fn(() => jest.fn()),
      getMarkets: jest.fn(),
      getSnapshot: jest.fn(() => null),
    },
    oiCaps: {
      subscribe: jest.fn(() => jest.fn()),
      getSnapshot: jest.fn(() => null),
    },
  };
};

// Wrapper component for tests
export const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <PerpsStreamProvider
    testStreamManager={
      createMockStreamManager() as unknown as PerpsStreamManager
    }
  >
    {children}
  </PerpsStreamProvider>
);

export const initialMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Mock requestAnimationFrame to execute immediately in tests
global.requestAnimationFrame = jest.fn((cb) => {
  setTimeout(cb, 0);
  return 1;
});

// The trade sheet mounts the order form one frame after its placeholder lays
// out; run that frame synchronously so sheet tests see the form after render.
export const runFrameSynchronously = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};

export function applyDefaultHookMocks() {
  (usePerpsOrderForm as jest.Mock).mockImplementation(
    mockDefaultUsePerpsOrderForm,
  );
  (usePerpsOrderExecution as jest.Mock).mockImplementation(
    mockDefaultUsePerpsOrderExecution,
  );
  (usePerpsRewards as jest.Mock).mockImplementation(mockDefaultUsePerpsRewards);
  (usePerpsToasts as jest.Mock).mockImplementation(mockDefaultUsePerpsToasts);
  (usePerpsEstimatedSlippage as jest.Mock).mockImplementation(
    mockDefaultUsePerpsEstimatedSlippage,
  );
  (usePerpsMaxSlippage as jest.Mock).mockImplementation(
    mockDefaultUsePerpsMaxSlippage,
  );

  mockUseIsPerpsBalanceSelected.mockReturnValue(false);
  mockUseTransactionPayToken.mockReturnValue({
    payToken: undefined,
    setPayToken: jest.fn(),
    isNative: undefined,
  });
  mockCreateEventBuilder.mockImplementation(() => ({
    addProperties: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  }));

  const { useInsufficientPayTokenBalanceAlert } = jest.requireMock(
    '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
  ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
  useInsufficientPayTokenBalanceAlert.mockReturnValue([]);

  const { useNoPayTokenQuotesAlert } = jest.requireMock(
    '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
  ) as { useNoPayTokenQuotesAlert: jest.Mock };
  useNoPayTokenQuotesAlert.mockReturnValue([]);
}

// Builds a usePerpsOrderContext mock matching the shape the component
// actually destructures, with the same defaults as the outer beforeEach,
// so individual tests only need to override the fields they care about
// (typically setAmount, to assert what the commit funnel flushed).
export const buildOrderContextMock = (
  overrides: Partial<ReturnType<typeof usePerpsOrderContext>> = {},
) => ({
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
  ...overrides,
});

export function setupPerpsOrderViewMocks() {
  mockPerpsSizeDenomination = 'usd';
  jest.useRealTimers();
  jest.clearAllMocks();
  applyDefaultHookMocks();
  (global.requestAnimationFrame as jest.Mock).mockImplementation(
    runFrameSynchronously,
  );
  jest.mocked(isHardwareAccount).mockReturnValue(false);
  mockPaymentOverride = undefined;
  (usePerpsOrderValidation as jest.Mock).mockReturnValue({
    isValid: true,
    errors: [],
    warnings: [],
    fieldIssues: [],
    isValidating: false,
    insufficientBalanceErrors: [],
    validateNow: jest.fn(),
  });
  mockPerpsAdvancedChartEnabled = false;
  mockSliderDragValue = 0;
  mockLeverageConfirmValue = 3;
  mockIsPaySubmitReady = true;
  mockPayTokenAccountBalanceUsd = '0';
  mockProviderEffectiveAvailableBalance = undefined;
  mockIsPayQuoteLoading = false;
  mockPayTotals = undefined;
  mockPayRequiredTokens = [];
  mockTradeScreenProps = undefined;
  mockTradeSheetOnClose = undefined;
  mockLeverageScreenProps = undefined;
  mockTPSLScreenProps = undefined;
  mockPayWithScreenProps = undefined;
  mockMarginInfoScreenProps = undefined;
  mockLiquidationInfoScreenProps = undefined;
  mockTradeSheetContentSizedScreens = undefined;
  mockTradeWithAnyTokenEnabled = false;
  (useTransactionConfirm as jest.Mock).mockReturnValue({
    onConfirm: jest.fn(),
  });
  (usePerpsOrderDepositTracking as jest.Mock).mockReturnValue({
    handleDepositConfirm: jest.fn(),
  });

  jest.mocked(useAnalytics).mockReturnValue({
    trackEvent: mockTrackEvent,
    createEventBuilder: mockCreateEventBuilder,
  } as unknown as ReturnType<typeof useAnalytics>);

  (useNavigation as jest.Mock).mockReturnValue({
    navigate: mockNavigate,
    goBack: mockGoBack,
    getParent: () => ({
      canGoBack: mockParentCanGoBack,
      goBack: mockParentGoBack,
    }),
    // The full-screen order view defers non-critical work until its push
    // transition ends; tests render it with the transition already finished.
    addListener: jest.fn(
      (
        event: string,
        listener: (e: { data: { closing: boolean } }) => void,
      ) => {
        if (event === 'transitionEnd') {
          listener({ data: { closing: false } });
        }
        return jest.fn();
      },
    ),
  });

  (useRoute as jest.Mock).mockReturnValue(defaultMockRoute);

  // Set up default mock implementations
  (usePerpsLiveAccount as jest.Mock).mockReturnValue(
    defaultMockHooks.usePerpsLiveAccount,
  );
  (usePerpsTrading as jest.Mock).mockReturnValue(
    defaultMockHooks.usePerpsTrading,
  );
  (usePerpsNetwork as jest.Mock).mockReturnValue(
    defaultMockHooks.usePerpsNetwork,
  );
  (usePerpsPrices as jest.Mock).mockReturnValue(
    defaultMockHooks.usePerpsPrices,
  );

  // Mock stream hooks
  (usePerpsLivePositions as jest.Mock).mockReturnValue({
    positions: [],
    isInitialLoading: false,
  });
  (usePerpsLivePrices as jest.Mock).mockReturnValue({
    ETH: { price: '3000', percentChange24h: '2.5', markPrice: '3000' },
    BTC: { price: '3000', percentChange24h: '2.5', markPrice: '3000' },
  });
  (usePerpsTopOfBook as jest.Mock).mockReturnValue({
    bid: '2999',
    ask: '3001',
  });

  // Mock the new hooks
  (usePerpsMarketData as jest.Mock).mockReturnValue({
    marketData: {
      name: 'ETH',
      szDecimals: 6,
      maxLeverage: 50,
      marginTableId: 1,
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });

  (usePerpsLiquidationPrice as jest.Mock).mockReturnValue({
    liquidationPrice: '2850.00',
    isCalculating: false,
    error: null,
  });

  (useMinimumOrderAmount as jest.Mock).mockReturnValue({
    minimumOrderAmount: 10,
    isLoading: false,
  });

  // Mock the context with default values
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
}

export const setMockIsPayQuoteLoading = (
  value: typeof mockIsPayQuoteLoading,
) => {
  mockIsPayQuoteLoading = value;
};

export const setMockPayTotals = (value: typeof mockPayTotals) => {
  mockPayTotals = value;
};

export const setMockPaymentOverride = (value: typeof mockPaymentOverride) => {
  mockPaymentOverride = value;
};

export const setMockTradeWithAnyTokenEnabled = (
  value: typeof mockTradeWithAnyTokenEnabled,
) => {
  mockTradeWithAnyTokenEnabled = value;
};

export const setMockPayRequiredTokens = (
  value: typeof mockPayRequiredTokens,
) => {
  mockPayRequiredTokens = value;
};

export const setMockIsPaySubmitReady = (value: typeof mockIsPaySubmitReady) => {
  mockIsPaySubmitReady = value;
};

export const setMockSliderDragValue = (value: typeof mockSliderDragValue) => {
  mockSliderDragValue = value;
};

export const setMockLeverageConfirmValue = (
  value: typeof mockLeverageConfirmValue,
) => {
  mockLeverageConfirmValue = value;
};

export const setMockPayTokenAccountBalanceUsd = (
  value: typeof mockPayTokenAccountBalanceUsd,
) => {
  mockPayTokenAccountBalanceUsd = value;
};

export const setMockPerpsSizeDenomination = (
  value: typeof mockPerpsSizeDenomination,
) => {
  mockPerpsSizeDenomination = value;
};

export const setMockSelectedEvmAccount = (
  value: typeof mockSelectedEvmAccount,
) => {
  mockSelectedEvmAccount = value;
};

export const setMockIsPerpsProModeActive = (
  value: typeof mockIsPerpsProModeActive,
) => {
  mockIsPerpsProModeActive = value;
};

export const getMockProviderEffectiveAvailableBalance = () =>
  mockProviderEffectiveAvailableBalance;

export const getMockTradeSheetOnClose = () => mockTradeSheetOnClose;

export const getMockTradeSheetContentSizedScreens = () =>
  mockTradeSheetContentSizedScreens;

export const getMockMarginInfoScreenProps = () => mockMarginInfoScreenProps;

export const getMockLiquidationInfoScreenProps = () =>
  mockLiquidationInfoScreenProps;
