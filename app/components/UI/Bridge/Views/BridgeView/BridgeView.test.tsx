import {
  BridgeView,
  mockFocusEffects,
  mockNavigate,
  mockRoute,
  mockSetParams,
  mockState,
  mockUseABTest,
  mockUseSwapsRebate,
  setupBridgeViewMocks,
  token2Address,
} from './BridgeView.testUtils';
import { initialState } from '../../_mocks_/initialState';
import {
  renderScreen,
  DeepPartial,
} from '../../../../../util/test/renderWithProvider';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import Routes from '../../../../../constants/navigation/Routes';
import {
  setDestToken,
  setSourceToken,
} from '../../../../../core/redux/slices/bridge';
import { Hex } from '@metamask/utils';
import type { BridgeRouteParams } from '../../hooks/useSwapBridgeNavigation';
import { createBridgeTestState } from '../../testUtils';
import { BridgeToken } from '../../types';
import { RequestStatus } from '@metamask/bridge-controller';
import { SolScope } from '@metamask/keyring-api';
import { mockUseBridgeQuoteData } from '../../_mocks_/useBridgeQuoteData.mock';
import { useBridgeQuoteData } from '../../hooks/useBridgeQuoteData';
import { strings } from '../../../../../../locales/i18n';
import { BridgeViewSelectorsIDs } from './BridgeView.testIds';
import { RootState } from '../../../../../reducers';
import { mockQuoteWithMetadata } from '../../_mocks_/bridgeQuoteWithMetadata';
import Engine from '../../../../../core/Engine';
import { BridgeTrendingTokensSectionTestIds } from '../../components/BridgeTrendingTokensSection/BridgeTrendingTokensSection.testIds';
import { SwapDiscoveryFeedTestIds } from '../../components/SwapDiscoveryFeed/SwapDiscoveryFeed.testIds';
import {
  SWAP_DISCOVERY_FEED_REVAMP_VARIANTS,
  SwapDiscoveryFeedRevampVariant,
} from '../../components/SwapDiscoveryFeed/abTestConfig';
import { Button } from '@metamask/design-system-react-native';
import { FEATURE_FLAG_NAME } from '../../../../../selectors/featureFlagController/rwa';

describe('BridgeView', () => {
  beforeEach(() => {
    setupBridgeViewMocks();
  });

  it('renders source and destination token areas', async () => {
    const { getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    expect(getByTestId(BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA)).toBeTruthy();
    expect(
      getByTestId(BridgeViewSelectorsIDs.DESTINATION_TOKEN_AREA),
    ).toBeTruthy();
  });

  it('renders the slippage settings button without an active quote', () => {
    jest
      .mocked(useBridgeQuoteData as unknown as jest.Mock)
      .mockImplementationOnce(() => ({
        ...mockUseBridgeQuoteData,
        activeQuote: null,
        formattedQuoteData: undefined,
      }));

    const { getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    expect(
      getByTestId(BridgeViewSelectorsIDs.SLIPPAGE_SETTINGS_BUTTON),
    ).toBeOnTheScreen();
  });

  it('opens the swap slippage modal from the settings button', () => {
    const testState = createBridgeTestState();
    const { getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: testState },
    );

    fireEvent.press(
      getByTestId(BridgeViewSelectorsIDs.SLIPPAGE_SETTINGS_BUTTON),
    );

    expect(mockNavigate).toHaveBeenCalledWith(Routes.BRIDGE.MODALS.ROOT, {
      screen: Routes.BRIDGE.MODALS.SWAP_DEFAULT_SLIPPAGE_MODAL,
      params: {
        sourceChainId: testState.bridge.sourceToken?.chainId,
        destChainId: testState.bridge.destToken?.chainId,
      },
    });
  });

  it('resets slippage and controller quote state when leaving the screen', () => {
    const testState = createBridgeTestState({
      bridgeReducerOverrides: {
        slippage: '3.5',
        isSlippageUserOverride: true,
      },
    });
    const { store, unmount } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: testState },
    );

    unmount();

    expect(store.getState().bridge.slippage).toBeUndefined();
    expect(store.getState().bridge.isSlippageUserOverride).toBe(false);
    expect(Engine.context.BridgeController.resetState).toHaveBeenCalled();
  });

  it('scrolls to top and clears the route param when requested on focus', () => {
    mockRoute.params = {
      sourcePage: 'test',
      scrollToTopOnNav: true,
    } as BridgeRouteParams;

    renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    act(() => {
      mockFocusEffects[mockFocusEffects.length - 1]?.();
    });

    expect(mockSetParams).toHaveBeenCalledWith({
      scrollToTopOnNav: undefined,
    });
  });

  it('should open BridgeTokenSelector when clicking source token', async () => {
    const { findByText } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    // Find and click the token button
    const tokenButton = await findByText('ETH');
    expect(tokenButton).toBeTruthy();
    fireEvent.press(tokenButton);

    // Verify navigation to BridgeTokenSelector
    expect(mockNavigate).toHaveBeenCalledWith(Routes.BRIDGE.TOKEN_SELECTOR, {
      type: 'source',
    });
  });

  it('should open token selector when clicking destination token area', async () => {
    const { getByText } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    // Find and click the destination token area
    const destTokenArea = getByText('Swap to');
    expect(destTokenArea).toBeTruthy();

    fireEvent.press(destTokenArea);

    // Verify navigation to BridgeTokenSelector
    expect(mockNavigate).toHaveBeenCalledWith(Routes.BRIDGE.TOKEN_SELECTOR, {
      type: 'dest',
    });
  });

  it('close keypad when pressing destination token input', async () => {
    const { getByTestId, queryByTestId, getByText } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    const sourceInput = getByTestId('source-token-area-input');
    await act(async () => {
      sourceInput.props.onPressIn();
    });

    // Verify keypad is open
    await waitFor(() => {
      expect(getByText('1')).toBeTruthy();
      expect(queryByTestId('keypad-delete-button')).toBeTruthy();
    });

    // Press the destination token input which should close the keypad
    const destInput = getByTestId('dest-token-area-input');

    // Call the onPressIn handler directly to trigger keypad close
    await act(async () => {
      destInput.props.onPressIn();
    });

    // Verify keypad is closed
    await waitFor(() => {
      expect(queryByTestId('keypad-delete-button')).toBeNull();
    });
  });

  it('should update source token amount when typing', async () => {
    jest
      .mocked(useBridgeQuoteData as unknown as jest.Mock)
      .mockImplementation(() => ({
        ...mockUseBridgeQuoteData,
        activeQuote: null,
        bestQuote: null,
        sourceAmount: undefined,
        isLoading: false,
        destTokenAmount: undefined,
        formattedQuoteData: undefined,
      }));

    const { getByTestId, getByText } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    const sourceInput = getByTestId('source-token-area-input');
    await act(async () => {
      sourceInput.props.onPressIn();
    });

    // Press number buttons to input
    fireEvent.press(getByText('9'));
    fireEvent.press(getByText('.'));
    fireEvent.press(getByText('5'));

    // Verify the input value is updated
    const input = getByTestId('source-token-area-input');
    await waitFor(() => {
      expect(input.props.value).toBe('9.5');
    });

    // Verify fiat value is displayed (9.5 ETH * $2000 = $19000)
    expect(getByText('$19,000.00')).toBeTruthy();
  });

  it('should update source token amount when selecting a quick-pick preset', async () => {
    jest
      .mocked(useBridgeQuoteData as unknown as jest.Mock)
      .mockImplementation(() => ({
        ...mockUseBridgeQuoteData,
        activeQuote: null,
        bestQuote: null,
        sourceAmount: undefined,
        isLoading: false,
        destTokenAmount: undefined,
        formattedQuoteData: undefined,
      }));

    const { getByTestId, getByText } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockState },
    );

    const sourceInput = getByTestId('source-token-area-input');
    await act(async () => {
      sourceInput.props.onPressIn();
    });

    await waitFor(() => {
      expect(getByText('25%')).toBeTruthy();
    });

    fireEvent.press(getByText('25%'));

    await waitFor(() => {
      expect(getByTestId('source-token-area-input').props.value).toBe('0.5');
    });
  });

  it('should display source token symbol and balance', async () => {
    const stateWithAmount = {
      ...mockState,
      bridge: {
        ...mockState.bridge,
        sourceAmount: '1.5',
      },
    };

    const { getByText, getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: stateWithAmount },
    );

    // Verify token symbol is displayed
    expect(getByText('ETH')).toBeTruthy();

    // Verify token amount is displayed
    const input = getByTestId('source-token-area-input');
    expect(input.props.value).toBe('1.5');

    // Verify fiat value is displayed (1.5 ETH * $2000 = $3000)
    expect(getByText('$3,000.00')).toBeTruthy();

    // Verify balance is displayed
    await waitFor(() => {
      expect(getByText('2 ETH')).toBeTruthy();
    });
  });

  it('should not display max button when source token is native token', () => {
    const stateWithNativeToken = {
      ...mockState,
      bridge: {
        ...mockState.bridge,
        sourceToken: {
          address: '0x0000000000000000000000000000000000000000', // Native ETH address
          chainId: '0x1' as Hex,
          decimals: 18,
          image: '',
          name: 'Ether',
          symbol: 'ETH',
        },
      },
    };

    const { queryByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: stateWithNativeToken },
    );

    // Verify max button is not present for native token
    expect(queryByTestId('token-input-area-max-button')).toBeNull();
  });

  it('should display max button when source token is not native token', () => {
    const stateWithERC20Token = {
      ...mockState,
      bridge: {
        ...mockState.bridge,
        sourceToken: {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC token address
          chainId: '0x1' as Hex,
          decimals: 6,
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
          name: 'USD Coin',
          symbol: 'USDC',
        },
      },
    };

    const { queryByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: stateWithERC20Token },
    );

    // Verify max button is present for ERC-20 token
    expect(queryByTestId('token-input-area-max-button')).toBeTruthy();
  });

  it('should set source amount to maximum balance when max button is pressed', async () => {
    const stateWithERC20Token = {
      ...mockState,
      bridge: {
        ...mockState.bridge,
        sourceToken: {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC token address
          chainId: '0x1' as Hex,
          decimals: 6,
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
          name: 'USD Coin',
          symbol: 'USDC',
        },
      },
    };

    const { getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: stateWithERC20Token },
    );

    // Find and press the max button
    const maxButton = getByTestId('token-input-area-max-button');
    expect(maxButton).toBeTruthy();
    fireEvent.press(maxButton);

    const input = getByTestId('source-token-area-input');
    await waitFor(() => {
      expect(input.props.value).toBe('2');
    });
  });

  it('switch tokens and preserve keypad state when clicking arrow button', async () => {
    const mockStateWithTokens = {
      ...mockState,
      bridge: {
        ...mockState.bridge,
        sourceToken: {
          address: '0x0000000000000000000000000000000000000000',
          chainId: '0x1' as Hex,
          decimals: 18,
          image: '',
          name: 'Ether',
          symbol: 'ETH',
        },
        destToken: {
          address: token2Address,
          chainId: '0x1' as Hex,
          decimals: 6,
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
          symbol: 'USDC',
        },
      },
    };

    const { getByTestId, queryByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: mockStateWithTokens },
    );

    // Keypad is open before flip
    const keypadBeforeFlip = queryByTestId('keypad-delete-button');
    const wasKeypadOpen = !!keypadBeforeFlip;

    const arrowButton = getByTestId('arrow-button');
    fireEvent.press(arrowButton);

    expect(setSourceToken).toHaveBeenCalledWith(
      mockStateWithTokens.bridge.destToken,
    );
    expect(setDestToken).toHaveBeenCalledWith(
      mockStateWithTokens.bridge.sourceToken,
    );

    // Keypad state is preserved after flip — not explicitly closed or opened
    const keypadAfterFlip = queryByTestId('keypad-delete-button');
    expect(!!keypadAfterFlip).toBe(wasKeypadOpen);
  });

  it('disables switch button when destination token network is disabled', () => {
    const avalancheChainId = '0xa86a' as Hex; // Avalanche C-Chain

    // Create base state with the disabled network configuration
    const baseStateWithDisabledNetwork = {
      ...mockState,
      engine: {
        ...mockState.engine,
        backgroundState: {
          ...mockState.engine?.backgroundState,
          NetworkEnablementController: {
            enabledNetworkMap: {
              eip155: {
                '0x1': true, // Ethereum enabled
                [avalancheChainId]: false, // Avalanche disabled
              },
              solana: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true,
              },
              bip122: {
                'bip122:000000000019d6689c085ae165831e93': true,
              },
              tron: {
                'tron:728126428': true,
              },
            },
          },
        },
      },
    } as DeepPartial<RootState>;

    const testState = createBridgeTestState(
      {
        bridgeReducerOverrides: {
          sourceToken: {
            address: '0x0000000000000000000000000000000000000000',
            chainId: '0x1' as Hex,
            decimals: 18,
            image: '',
            name: 'Ether',
            symbol: 'ETH',
          },
          destToken: {
            address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
            chainId: avalancheChainId,
            decimals: 6,
            image: '',
            name: 'USD Coin',
            symbol: 'USDC',
          },
          selectedDestChainId: avalancheChainId,
        },
      },
      baseStateWithDisabledNetwork,
    );

    const { getByTestId } = renderScreen(
      BridgeView,
      {
        name: Routes.BRIDGE.ROOT,
      },
      { state: testState },
    );

    const arrowButton = getByTestId('arrow-button');

    // Button should be disabled when dest network is disabled
    expect(arrowButton).toBeDisabled();
    // When disabled, onPress is set to undefined in FLipQuoteButton
    expect(arrowButton.props.onPress).toBeUndefined();
  });

  describe('Solana Swap', () => {
    it('renders non-EVM source token without native reserve warning', () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quoteRequest: {
            insufficientBal: false,
          },
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
          sourceToken: {
            address: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
            chainId: SolScope.Mainnet,
            decimals: 9,
            image: '',
            name: 'Solana',
            symbol: 'SOL',
          },
          destToken: {
            address: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
            chainId: SolScope.Mainnet,
            decimals: 9,
            image: '',
            name: 'Solana',
            symbol: 'SOL',
          },
        },
      });

      const { queryByText } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      expect(
        queryByText(
          strings('bridge.insufficient_native_reserve_title', {
            ticker: 'SOL',
          }),
        ),
      ).toBeNull();
    });

    it('leaves slippage unset until a current-pair quote suggests a value', async () => {
      const mockQuote = mockQuoteWithMetadata;
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quoteRequest: {
            insufficientBal: false,
          },
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuote],
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
          sourceToken: {
            address: 'So11111111111111111111111111111111111111112',
            chainId: SolScope.Mainnet,
            decimals: 9,
            image: '',
            name: 'Solana',
            symbol: 'SOL',
          },
          destToken: {
            address: 'So11111111111111111111111111111111111111112',
            chainId: SolScope.Mainnet,
            decimals: 9,
            image: '',
            name: 'Solana',
            symbol: 'SOL',
          },
        },
      });

      const { store } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Quotes without quote.slippage must not invent a client default.
      await waitFor(() => {
        expect(store.getState().bridge.slippage).toBeUndefined();
      });
    });
  });

  describe('RWA same-chain EVM swap', () => {
    it('leaves slippage unset when the active quote is not for the selected pair', async () => {
      const mockQuote = mockQuoteWithMetadata;
      const ethChainId = '0x1' as const;
      const testState = createBridgeTestState(
        {
          bridgeControllerOverrides: {
            quoteRequest: {
              insufficientBal: false,
            },
            quotesLoadingStatus: RequestStatus.FETCHED,
            quotes: [mockQuote],
          },
          bridgeReducerOverrides: {
            sourceAmount: '1.0',
            sourceToken: {
              address: '0x0000000000000000000000000000000000000001',
              chainId: ethChainId,
              decimals: 18,
              image: '',
              name: 'Token A',
              symbol: 'TKA',
              rwaData: { instrumentType: 'stock' } as BridgeToken['rwaData'],
            },
            destToken: {
              address: '0x0000000000000000000000000000000000000002',
              chainId: ethChainId,
              decimals: 6,
              image: '',
              name: 'USDC',
              symbol: 'USDC',
            },
          },
        },
        {
          ...initialState,
          engine: {
            ...initialState.engine,
            backgroundState: {
              ...initialState.engine.backgroundState,
              RemoteFeatureFlagController: {
                ...initialState.engine.backgroundState
                  .RemoteFeatureFlagController,
                remoteFeatureFlags: {
                  ...initialState.engine.backgroundState
                    .RemoteFeatureFlagController.remoteFeatureFlags,
                  [FEATURE_FLAG_NAME]: true,
                },
              },
            },
          },
        },
      );

      const { store } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        expect(store.getState().bridge.slippage).toBeUndefined();
      });
    });
  });

  describe('Bottom Content', () => {
    const renderZeroStateBridgeView = () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [],
          quotesLastFetched: 12,
        },
        bridgeReducerOverrides: {
          sourceAmount: undefined,
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: null,
          isLoading: false,
          quoteFetchError: null,
          isNoQuotesAvailable: false,
          destTokenAmount: undefined,
        }));

      return renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset to default mock so persistent mockImplementation from prior tests
      // does not leak (clearAllMocks only clears calls, not implementations)
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => mockUseBridgeQuoteData);
    });

    it('does not display keypad on initial render when no amount is entered', () => {
      const { queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      expect(queryByTestId('keypad-delete-button')).toBeNull();
    });

    it('does not display keypad on initial render when amount is zero', () => {
      const stateWithZeroAmount = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          sourceAmount: '0',
        },
      };

      const { queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: stateWithZeroAmount },
      );

      expect(queryByTestId('keypad-delete-button')).toBeNull();
    });

    it('displays keypad on initial focus when route requests source amount auto-focus', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        autoFocusSourceAmountInput: true,
      } as BridgeRouteParams;

      const { queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      act(() => {
        mockFocusEffects.forEach((focusEffect) => {
          focusEffect();
        });
      });

      await waitFor(() => {
        expect(queryByTestId('keypad-delete-button')).toBeTruthy();
      });
    });

    it('shows loading mode with quote skeleton only', () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLastFetched: null,
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: true,
          activeQuote: null,
        }));

      const { getByTestId, queryByTestId, queryByText } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      expect(
        getByTestId(BridgeViewSelectorsIDs.QUOTE_DETAILS_SKELETON),
      ).toBeTruthy();
      expect(queryByTestId('banneralert')).toBeNull();
      expect(queryByTestId('edit-slippage-button')).toBeNull();
      expect(
        queryByTestId(BridgeTrendingTokensSectionTestIds.SECTION),
      ).toBeNull();
      expect(queryByText('Fetching quote')).toBeNull();
    });

    it('shows quote skeleton when a non-zero input has no active quote yet', () => {
      const testState = createBridgeTestState({
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: false,
          activeQuote: null,
          needsNewQuote: false,
        }));

      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      expect(
        getByTestId(BridgeViewSelectorsIDs.QUOTE_DETAILS_SKELETON),
      ).toBeTruthy();
      expect(queryByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON)).toBeNull();
      expect(queryByTestId('edit-slippage-button')).toBeNull();
    });

    it('keeps quote mode content visible while refreshing an existing quote', async () => {
      const now = Date.now();
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.LOADING,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: now,
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: true,
          activeQuote: mockQuoteWithMetadata,
        }));

      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        expect(queryByTestId('edit-slippage-button')).toBeTruthy();
      });

      expect(getByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON)).toBeTruthy();
      expect(
        queryByTestId(BridgeViewSelectorsIDs.QUOTE_DETAILS_SKELETON),
      ).toBeNull();
    });

    it('shows quote mode with quote content and confirm button', async () => {
      const now = Date.now();
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: now,
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: false,
          activeQuote: mockQuoteWithMetadata,
        }));

      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        expect(queryByTestId('edit-slippage-button')).toBeTruthy();
      });
      expect(getByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON)).toBeTruthy();
      expect(
        queryByTestId(BridgeTrendingTokensSectionTestIds.SECTION),
      ).toBeNull();
    });

    it('renders the rebate banner above the keypad confirm button', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        autoFocusSourceAmountInput: true,
      } as BridgeRouteParams;
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: Date.now(),
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: false,
          activeQuote: mockQuoteWithMetadata,
        }));
      mockUseSwapsRebate.mockReturnValue(5);

      const { getByTestId, getAllByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );
      act(() => {
        mockFocusEffects.forEach((focusEffect) => {
          focusEffect();
        });
      });

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON_KEYPAD),
        ).toBeTruthy();
      });
      // The footer copy stays mounted under the sheet so its layout never shifts.
      expect(getAllByTestId('mock-swaps-rebate-banner')).toHaveLength(2);
      expect(mockUseSwapsRebate).toHaveBeenCalledWith(
        mockQuoteWithMetadata.quote,
      );
    });

    it('hides the keypad rebate banner when a new quote is needed', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        autoFocusSourceAmountInput: true,
      } as BridgeRouteParams;
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: Date.now(),
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: false,
          activeQuote: mockQuoteWithMetadata,
          needsNewQuote: true,
        }));
      mockUseSwapsRebate.mockReturnValue(5);

      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );
      act(() => {
        mockFocusEffects.forEach((focusEffect) => {
          focusEffect();
        });
      });

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON_KEYPAD),
        ).toBeTruthy();
      });
      expect(queryByTestId('mock-swaps-rebate-banner')).toBeNull();
    });

    it('renders the rebate banner in the footer when the keypad is closed', async () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: Date.now(),
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
        },
      });
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isLoading: false,
          activeQuote: mockQuoteWithMetadata,
        }));
      mockUseSwapsRebate.mockReturnValue(5);

      const { getByTestId, getAllByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      await waitFor(() => {
        expect(getByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON)).toBeTruthy();
      });
      expect(
        queryByTestId(BridgeViewSelectorsIDs.CONFIRM_BUTTON_KEYPAD),
      ).toBeNull();
      expect(getAllByTestId('mock-swaps-rebate-banner')).toHaveLength(1);
    });

    it('shows zero mode with trending section and without quote content', () => {
      const { getByTestId, queryByTestId } = renderZeroStateBridgeView();

      expect(
        getByTestId(BridgeTrendingTokensSectionTestIds.SECTION),
      ).toBeTruthy();
      expect(queryByTestId('edit-slippage-button')).toBeNull();
    });

    it('does not render discovery content in zero mode for empty variant', () => {
      mockUseABTest.mockReturnValue({
        variant:
          SWAP_DISCOVERY_FEED_REVAMP_VARIANTS[
            SwapDiscoveryFeedRevampVariant.Empty
          ],
        variantName: SwapDiscoveryFeedRevampVariant.Empty,
        isActive: true,
      });

      const { queryByTestId } = renderZeroStateBridgeView();

      expect(
        queryByTestId(BridgeTrendingTokensSectionTestIds.SECTION),
      ).toBeNull();
      expect(queryByTestId(SwapDiscoveryFeedTestIds.ROOT)).toBeNull();
    });

    it('does not navigate to QuoteExpiredModal when quote expires without refresh', async () => {
      // useRenderQuoteExpireModal was removed; the expired-quote modal no longer
      // exists. Instead, the cached quote stays visible and "Get new quote"
      // appears in the footer.
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isExpired: true,
          willRefresh: false,
          needsNewQuote: true,
        }));

      renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          {
            screen: Routes.BRIDGE.BRIDGE_VIEW,
          },
        );
      });
    });

    it('does not navigate to QuoteExpiredModal when quote expires with refresh', async () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isExpired: true,
          willRefresh: true,
        }));

      renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          {
            screen: Routes.BRIDGE.BRIDGE_VIEW,
          },
        );
      });
    });

    it('does not navigate to QuoteExpiredModal when quote is valid', async () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isExpired: false,
          willRefresh: false,
        }));

      renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          {
            screen: Routes.BRIDGE.BRIDGE_VIEW,
          },
        );
      });
    });

    it('does not navigate to QuoteExpiredModal when RecipientSelectorModal is open', async () => {
      // Set the Redux state to indicate user is selecting recipient
      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          isSelectingRecipient: true,
        },
      };

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isExpired: true,
          willRefresh: false,
        }));

      renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          {
            screen: Routes.BRIDGE.BRIDGE_VIEW,
          },
        );
      });
    });

    it('shows cached quote content when quote expires', async () => {
      // When quotes expire the cached quote (still in Redux) is shown in the
      // QuoteDetailsCard. The slippage button must remain visible.
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          isExpired: true,
          willRefresh: false,
          isLoading: false,
          needsNewQuote: true,
          // activeQuote remains the cached quote — not cleared on expiry
        }));

      // createBridgeTestState provides source/dest tokens so QuoteDetailsCard
      // passes its early-return guard and renders the slippage button.
      const testState = createBridgeTestState({
        bridgeReducerOverrides: { sourceAmount: '1.0' },
      });

      const { queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          {
            screen: Routes.BRIDGE.BRIDGE_VIEW,
          },
        );
      });
      expect(queryByTestId('edit-slippage-button')).not.toBeNull();
    });
  });
});
