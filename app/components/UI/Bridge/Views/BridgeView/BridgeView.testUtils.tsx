import React from 'react';
import { initialState } from '../../_mocks_/initialState';
import { DeepPartial } from '../../../../../util/test/renderWithProvider';
import {
  setDestToken,
  setSourceToken,
} from '../../../../../core/redux/slices/bridge';
import { Hex } from '@metamask/utils';
import type { BridgeRouteParams } from '../../hooks/useSwapBridgeNavigation';
import { mockUseBridgeQuoteData } from '../../_mocks_/useBridgeQuoteData.mock';
import { useBridgeQuoteData } from '../../hooks/useBridgeQuoteData';
import { MOCK_ENTROPY_SOURCE as mockEntropySource } from '../../../../../util/test/keyringControllerTestUtils';
import { RootState } from '../../../../../reducers';
import Engine from '../../../../../core/Engine';
import {
  SWAP_DISCOVERY_FEED_REVAMP_VARIANTS,
  SwapDiscoveryFeedRevampVariant,
} from '../../components/SwapDiscoveryFeed/abTestConfig';
import { useABTest } from '../../../../../hooks/useABTest';
import { BridgeSessionProvider } from '../../providers/BridgeSessionProvider';
import BridgeViewContent from '.';

// Mock the account-tree-controller file that imports the problematic module
jest.mock(
  '../../../../../multichain-accounts/controllers/account-tree-controller',
  () => ({
    accountTreeControllerInit: jest.fn(() => ({
      controller: {
        state: { accountTree: { wallets: {} } },
      },
    })),
  }),
);

export const mockState = {
  ...initialState,
  engine: {
    ...initialState.engine,
    backgroundState: {
      ...initialState.engine.backgroundState,
      KeyringController: {
        keyrings: [
          {
            accounts: ['0x1234567890123456789012345678901234567890'],
            type: 'HD Key Tree',
            metadata: {
              id: mockEntropySource,
              name: '',
            },
          },
        ],
      },
      AccountsController: {
        internalAccounts: {
          selectedAccount: '30786334-3935-4563-b064-363339643939',
          accounts: {
            '30786334-3935-4563-b064-363339643939': {
              id: '30786334-3935-4563-b064-363339643939',
              address: '0x1234567890123456789012345678901234567890',
              name: 'Account 1',
              type: 'eip155:eoa',
              scopes: ['eip155:0'],
              metadata: {
                lastSelected: 0,
                keyring: {
                  type: 'HD Key Tree',
                },
              },
            },
          },
        },
      },
    },
  },
} as DeepPartial<RootState>;

// TODO remove this mock once we have a real implementation
jest.mock('../../../../../selectors/confirmTransaction');

// The real service imports core/Engine/Engine directly, bypassing the
// core/Engine mock below and loading every controller.
jest.mock('../../../../../core/ReactQueryService', () => ({
  __esModule: true,
  default: {
    queryClient: {
      getQueryData: jest.fn(),
      prefetchQuery: jest.fn(() => Promise.resolve()),
    },
  },
}));

jest.mock('../../../../../core/Engine', () => {
  const { MOCK_ENTROPY_SOURCE } = jest.requireActual(
    '../../../../../util/test/keyringControllerTestUtils',
  );
  return {
    controllerMessenger: {
      // Messenger actions the tabs call are async, e.g. the limit tab's
      // OHLCV subscribe, so this has to hand back a promise.
      call: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    },
    context: {
      KeyringController: {
        state: {
          keyrings: [
            {
              accounts: ['0x1234567890123456789012345678901234567890'],
              type: 'HD Key Tree',
              metadata: {
                id: MOCK_ENTROPY_SOURCE,
                name: '',
              },
            },
          ],
        },
      },
      AccountsController: {
        state: {
          internalAccounts: {
            selectedAccount: '30786334-3935-4563-b064-363339643939',
            accounts: {
              '30786334-3935-4563-b064-363339643939': {
                id: '30786334-3935-4563-b064-363339643939',
                address: '0x1234567890123456789012345678901234567890',
                name: 'Account 1',
                type: 'eip155:eoa',
                scopes: ['eip155:0'],
                metadata: {
                  lastSelected: 0,
                  keyring: {
                    type: 'HD Key Tree',
                  },
                },
              },
            },
          },
        },
      },
      AccountTreeController: {
        accountTree: {
          wallets: {},
        },
      },
      GasFeeController: {
        startPolling: jest.fn(),
        stopPollingByPollingToken: jest.fn(),
      },
      NetworkController: {
        getNetworkConfigurationByNetworkClientId: jest.fn(),
      },
      BridgeStatusController: {
        submitTx: jest.fn().mockResolvedValue({ success: true }),
      },
      BridgeController: {
        resetState: jest.fn(),
        setBridgeFeatureFlags: jest.fn().mockResolvedValue(undefined),
        setInputPrimaryDenomination: jest.fn(),
        updateBridgeQuoteRequestParams: jest.fn(),
        trackUnifiedSwapBridgeEvent: jest.fn(),
      },
    },
    getTotalEvmFiatAccountBalance: jest.fn().mockReturnValue({
      balance: '1000000000000000000', // 1 ETH
      fiatBalance: '2000', // $2000
    }),
  };
});

// Mock useAccounts hook
jest.mock('../../../../hooks/useAccounts', () => ({
  useAccounts: () => ({
    accounts: [
      {
        id: '30786334-3935-4563-b064-363339643939',
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
        type: 'HD Key Tree',
        yOffset: 0,
        isSelected: true,
        caipAccountId: 'eip155:1:0x1234567890123456789012345678901234567890',
        scopes: ['eip155:0', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      },
    ],
    ensByAccountAddress: {
      '0x1234567890123456789012345678901234567890': '',
    },
  }),
}));

// Mock useSubmitBridgeTx hook (needed because SwapsMarketOrderConfirmButton imports it)
jest.mock('../../../../../util/bridge/hooks/useSubmitBridgeTx', () => ({
  __esModule: true,
  default: () => ({
    submitBridgeTx: jest.fn(),
  }),
}));

jest.mock('../../../../../core/redux/slices/bridge', () => {
  const actualBridgeSlice = jest.requireActual(
    '../../../../../core/redux/slices/bridge',
  );
  return {
    __esModule: true,
    ...actualBridgeSlice,
    default: actualBridgeSlice.default,
    setSourceToken: jest.fn(actualBridgeSlice.setSourceToken),
    setDestToken: jest.fn(actualBridgeSlice.setDestToken),
  };
});

jest.mock('../../../../../selectors/bridge', () => ({
  ...jest.requireActual('../../../../../selectors/bridge'),
  selectSourceWalletAddress: jest.fn(),
}));

jest.mock(
  '../../../../../selectors/featureFlagController/gasFeesSponsored',
  () => ({
    getGasFeesSponsoredNetworkEnabled: jest.fn(
      () => (chainId: string) =>
        // Return true for Polygon (0x89) to test sponsored quotes
        chainId === '0x89',
    ),
  }),
);

export const mockNavigate = jest.fn();
export const mockSetParams = jest.fn();
export const mockGoBack = jest.fn();
export const mockFocusEffects: (() => void | (() => void))[] = [];
export const mockRoute = {
  params: {
    sourcePage: 'test',
  } as BridgeRouteParams,
};

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useFocusEffect: jest.fn((callback: () => void | (() => void)) => {
      mockFocusEffects.push(callback);
    }),
    useNavigation: () => ({
      navigate: mockNavigate,
      setParams: mockSetParams,
      setOptions: jest.fn(),
      goBack: mockGoBack,
    }),
    useRoute: () => mockRoute,
  };
});

// Mock useLatestBalance hook
jest.mock('../../hooks/useLatestBalance', () => ({
  useLatestBalance: jest.fn().mockImplementation(({ address, chainId }) => {
    if (!address || !chainId) return undefined;

    // Need to do this due to this error: "The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables.""
    const actualEthers = jest.requireActual('ethers');

    return {
      displayBalance: '2.0',
      atomicBalance: actualEthers.BigNumber.from('2000000000000000000'), // 2 ETH
    };
  }),
}));

jest.mock('../../hooks/useBridgeQuoteData', () => ({
  useBridgeQuoteData: jest
    .fn()
    .mockImplementation(() => mockUseBridgeQuoteData),
}));

jest.mock('../../hooks/useRecurringOrders', () => ({
  useRecurringOrders: jest.fn(() => ({
    orders: [],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  })),
}));

jest.mock('../../hooks/useLimitOrders', () => ({
  useLimitOrders: jest.fn(() => ({
    orders: [],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  })),
}));

jest.mock('../../hooks/useSentinelFeeTokenValidation', () => ({
  useSentinelFeeTokenValidation: jest.fn(() => ({
    isValid: true,
    retry: jest.fn(),
  })),
}));

jest.mock('../../hooks/useBridgeQuoteData/BridgeQuoteDataContext', () => {
  const { useBridgeQuoteData } = jest.requireMock(
    '../../hooks/useBridgeQuoteData',
  );
  return {
    BridgeQuoteDataProvider: ({ children }: { children: unknown }) => children,
    useBridgeQuoteDataContext: jest.fn(() => useBridgeQuoteData()),
  };
});

jest.mock('../../../../../util/address', () => ({
  ...jest.requireActual('../../../../../util/address'),
  isHardwareAccount: jest.fn(),
}));

jest.mock('../../../HardwareWallet/Swaps/useHwConnectionMonitoring', () => ({
  useHwConnectionMonitoring: jest.fn(() => ({
    isDisconnectedRef: { current: false },
    resetHandledError: jest.fn(),
  })),
}));

jest.mock('../../../HardwareWallet/Swaps/hooks/useHwQrState', () => ({
  useHwQrState: jest.fn(() => ({
    isReadingQrSignature: false,
    setIsReadingQrSignature: jest.fn(),
    isQrHardwareWallet: false,
    showInlineQrSigning: false,
    handleQrSignatureCancel: jest.fn(),
    pendingScanRequest: undefined,
  })),
}));

jest.mock('react-native-fade-in-image', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      placeholderStyle,
    }: {
      children: React.ReactNode;
      placeholderStyle?: unknown;
    }) => React.createElement(View, { style: placeholderStyle }, children),
  };
});

jest.mock('../../../../../hooks/useABTest', () => ({
  useABTest: jest.fn(),
}));

jest.mock('../../../Tokens/hooks/useTokenSecurityQuery', () => ({
  useTokenSecurityQuery: jest.fn(() => ({ data: null })),
}));

export const mockUseABTest = jest.mocked(useABTest);

jest.mock(
  '../../components/BridgeTrendingTokensSection/BridgeTrendingTokensSection',
  () => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    const TrendingTokensSectionTestIds = jest.requireActual(
      '../../components/BridgeTrendingTokensSection/BridgeTrendingTokensSection.testIds',
    ).BridgeTrendingTokensSectionTestIds;

    return {
      __esModule: true,
      default: () =>
        React.createElement(View, {
          testID: TrendingTokensSectionTestIds.SECTION,
        }),
    };
  },
);

// Mock MMDS BottomSheetDialog so that onCloseDialog synchronously calls onClose,
// allowing keypad close() to work in tests (the real component uses reanimated
// withTiming which never completes in JSDOM).
jest.mock('@metamask/design-system-react-native', () => {
  const actual = jest.requireActual('@metamask/design-system-react-native');
  const MockReact = jest.requireActual('react');

  return {
    ...actual,
    BottomSheetDialog: MockReact.forwardRef(
      (
        {
          children,
          onClose,
        }: { children: React.ReactNode; onClose?: () => void },
        dialogRef: React.Ref<{ onCloseDialog: () => void }>,
      ) => {
        MockReact.useImperativeHandle(dialogRef, () => ({
          onCloseDialog: () => onClose?.(),
        }));
        return children;
      },
    ),
  };
});

// Mock gas included support hooks
export const mockUseIsGasIncludedSTXSendBundleSupported = jest.fn();
jest.mock(
  '../../hooks/useIsGasIncludedSTXSendBundleSupported/index.ts',
  () => ({
    useIsGasIncludedSTXSendBundleSupported: (chainId?: string) =>
      mockUseIsGasIncludedSTXSendBundleSupported(chainId),
  }),
);

export const mockUseSwapsRebate = jest.fn();
jest.mock('../../hooks/useSwapsRebate', () => ({
  useSwapsRebate: (...args: unknown[]) => mockUseSwapsRebate(...args),
}));

jest.mock('../../../shared/RebateBanner', () => {
  const MockReact = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () =>
      MockReact.createElement(View, { testID: 'mock-swaps-rebate-banner' }),
  };
});

export const mockUseIsGasIncluded7702Supported = jest.fn();
jest.mock('../../hooks/useIsGasIncluded7702Supported/index.ts', () => ({
  useIsGasIncluded7702Supported: (chainId?: string) =>
    mockUseIsGasIncluded7702Supported(chainId),
}));

export const BridgeView = () => (
  <BridgeSessionProvider>
    <BridgeViewContent />
  </BridgeSessionProvider>
);

export const token2Address =
  '0x0000000000000000000000000000000000000002' as Hex;

export function setupBridgeViewMocks() {
  jest.clearAllMocks();
  mockUseSwapsRebate.mockReturnValue(null);
  mockFocusEffects.length = 0;
  mockRoute.params = {
    sourcePage: 'test',
  } as BridgeRouteParams;
  mockUseABTest.mockReturnValue({
    variant:
      SWAP_DISCOVERY_FEED_REVAMP_VARIANTS[
        SwapDiscoveryFeedRevampVariant.Control
      ],
    variantName: SwapDiscoveryFeedRevampVariant.Control,
    isActive: true,
  });
}
