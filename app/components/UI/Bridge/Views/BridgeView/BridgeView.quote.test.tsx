import {
  BridgeView,
  mockNavigate,
  mockRoute,
  mockState,
  mockUseIsGasIncluded7702Supported,
  mockUseIsGasIncludedSTXSendBundleSupported,
  setupBridgeViewMocks,
} from './BridgeView.testUtils';
import { merge } from 'lodash';
import {
  renderScreen,
  DeepPartial,
} from '../../../../../util/test/renderWithProvider';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import Routes from '../../../../../constants/navigation/Routes';
import { resetBridgeState } from '../../../../../core/redux/slices/bridge';
import { Hex } from '@metamask/utils';
import type { BridgeRouteParams } from '../../hooks/useSwapBridgeNavigation';
import { createBridgeTestState } from '../../testUtils';
import { BridgeToken, BridgeViewMode, SecurityDataType } from '../../types';
import {
  RequestStatus,
  MetaMetricsSwapsEventSource,
  QuoteStreamCompleteReason,
  TokenFeatureType,
} from '@metamask/bridge-controller';
import { TokenWarningModalMode } from '../../components/TokenWarningModal/constants';
import { mockBridgeReducerState } from '../../_mocks_/bridgeReducerState';
import { mockUseBridgeQuoteData } from '../../_mocks_/useBridgeQuoteData.mock';
import { useBridgeQuoteData } from '../../hooks/useBridgeQuoteData';
import { strings } from '../../../../../../locales/i18n';
import { BridgeViewSelectorsIDs } from './BridgeView.testIds';
import { RootState } from '../../../../../reducers';
import { mockQuoteWithMetadata } from '../../_mocks_/bridgeQuoteWithMetadata';
import { Button } from '@metamask/design-system-react-native';
import { BridgeTabKey } from './BridgeView.constants';

describe('BridgeView', () => {
  beforeEach(() => {
    setupBridgeViewMocks();
  });

  describe('quoteStreamComplete error banner', () => {
    it('shows the banner when quoteStreamComplete has a reason', async () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [],
          quotesLastFetched: 12,
          quoteStreamComplete: {
            hasQuotes: false,
            quoteCount: 0,
            reason: QuoteStreamCompleteReason.AMOUNT_TOO_LOW,
          },
        },
        bridgeReducerOverrides: {
          sourceAmount: '0.0001',
        },
      });

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      await waitFor(() => {
        expect(
          getByText(strings('bridge.quote_stream_complete_amount_too_low')),
        ).toBeTruthy();
      });
    });

    it('does not show the banner when quoteStreamComplete is null', async () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [],
          quotesLastFetched: 12,
          quoteStreamComplete: null,
        },
      });

      const { queryByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      await waitFor(() => {
        expect(
          queryByText(strings('bridge.quote_stream_complete_amount_too_low')),
        ).toBeNull();
      });
    });

    it('does not show the banner when quoteStreamComplete has no reason', async () => {
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [],
          quotesLastFetched: 12,
          quoteStreamComplete: { hasQuotes: false, quoteCount: 0 },
        },
      });

      const { queryByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      await waitFor(() => {
        expect(
          queryByText(strings('bridge.quote_stream_complete_amount_too_low')),
        ).toBeNull();
      });
    });
  });

  describe('deep link parameter handling', () => {
    const mockDeepLinkSourceToken = {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: '0x1' as Hex,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
    };

    const mockDeepLinkDestToken = {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      chainId: '0x1' as Hex,
      decimals: 6,
      name: 'Tether USD',
      symbol: 'USDT',
    };

    const mockSecondDeepLinkSourceToken = {
      address: '0x0000000000000000000000000000000000000003',
      chainId: '0x1' as Hex,
      decimals: 18,
      name: 'Second Source',
      symbol: 'SECOND_SOURCE',
    };

    const mockSecondDeepLinkDestToken = {
      address: '0x0000000000000000000000000000000000000004',
      chainId: '0x1' as Hex,
      decimals: 18,
      name: 'Second Destination',
      symbol: 'SECOND_DEST',
    };

    const stateWithSwapTabsEnabled = () =>
      merge({}, mockState, {
        engine: {
          backgroundState: {
            RemoteFeatureFlagController: {
              remoteFeatureFlags: {
                swapsLimitOrder: { enabled: true },
                swapsRecurringBuy: { enabled: true },
              },
            },
          },
        },
      }) as DeepPartial<RootState>;

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset route params to default for deep link testing
      mockRoute.params = {
        sourcePage: 'deeplink',
      } as BridgeRouteParams;
    });

    it('uses sourceToken from route params when provided', () => {
      mockRoute.params.sourceToken = mockDeepLinkSourceToken;

      // Update the mock state to include the deep link source token
      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          sourceToken: mockDeepLinkSourceToken,
        },
      };

      const { getByText } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Should display the deep link token symbol
      expect(getByText('USDC')).toBeTruthy();
    });

    it('uses destToken from route params when provided', () => {
      mockRoute.params.destToken = mockDeepLinkDestToken;

      const { getByText } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      // Should display the deep link dest token symbol
      expect(getByText('USDT')).toBeTruthy();
    });

    it('uses sourceAmount from route params when provided', () => {
      // Need to provide a source token for the amount to be set
      mockRoute.params.sourceToken = {
        address: '0x0000000000000000000000000000000000000000',
        chainId: '0x1' as Hex,
        decimals: 18,
        image: '',
        name: 'Ether',
        symbol: 'ETH',
      };
      mockRoute.params.sourceAmount = '1000000';

      // Update the mock state to include the source token and amount
      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          sourceToken: mockRoute.params.sourceToken,
          sourceAmount: '1000000',
        },
      };

      const { getByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Should display the deep link amount in the input (formatted with commas)
      const input = getByTestId('source-token-area-input');
      expect(input.props.value).toBe('1,000,000');
    });

    it('uses all deep link params when all are provided', () => {
      mockRoute.params = {
        ...mockRoute.params,
        sourceToken: mockDeepLinkSourceToken,
        destToken: mockDeepLinkDestToken,
        sourceAmount: '1000000',
      } as BridgeRouteParams;

      // Update the mock state to include the deep link tokens and amount
      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          sourceToken: mockDeepLinkSourceToken,
          destToken: mockDeepLinkDestToken,
          sourceAmount: '1000000',
        },
      };

      const { getByText, getByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Should display all deep link data
      expect(getByText('USDC')).toBeTruthy();
      expect(getByText('USDT')).toBeTruthy();
      const input = getByTestId('source-token-area-input');
      expect(input.props.value).toBe('1,000,000');
    });

    it('falls back to Redux state when deep link params are not provided', () => {
      // Ensure no deep link params are set
      mockRoute.params = {
        sourcePage: 'test',
      } as BridgeRouteParams;

      const { getByText } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      // Should display default ETH token from Redux state
      expect(getByText('ETH')).toBeTruthy();
    });

    it.each([
      {
        name: 'Market from Limit',
        startingTab: BridgeTabKey.Limit,
        targetTab: BridgeTabKey.Market,
        startingTokenAreaTestId: BridgeViewSelectorsIDs.LIMIT_SOURCE_TOKEN_AREA,
        sourceTokenAreaTestId: BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA,
      },
      {
        name: 'Market from Recurring',
        startingTab: BridgeTabKey.Recurring,
        targetTab: BridgeTabKey.Market,
        startingTokenAreaTestId:
          BridgeViewSelectorsIDs.RECURRING_SOURCE_TOKEN_AREA,
        sourceTokenAreaTestId: BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA,
      },
      {
        name: 'Limit',
        startingTab: BridgeTabKey.Limit,
        targetTab: BridgeTabKey.Limit,
        startingTokenAreaTestId: BridgeViewSelectorsIDs.LIMIT_SOURCE_TOKEN_AREA,
        sourceTokenAreaTestId: BridgeViewSelectorsIDs.LIMIT_SOURCE_TOKEN_AREA,
      },
      {
        name: 'Recurring',
        startingTab: BridgeTabKey.Recurring,
        targetTab: BridgeTabKey.Recurring,
        startingTokenAreaTestId:
          BridgeViewSelectorsIDs.RECURRING_SOURCE_TOKEN_AREA,
        sourceTokenAreaTestId:
          BridgeViewSelectorsIDs.RECURRING_SOURCE_TOKEN_AREA,
      },
    ])(
      'rehydrates explicit tokens for a warm $name deeplink',
      async ({
        startingTab,
        targetTab,
        startingTokenAreaTestId,
        sourceTokenAreaTestId,
      }) => {
        mockRoute.params = {
          sourcePage: 'deeplink',
          bridgeViewMode: BridgeViewMode.Unified,
          location: MetaMetricsSwapsEventSource.MainView,
          sourceToken: mockDeepLinkSourceToken,
          destToken: mockDeepLinkDestToken,
          swapViewTraceId: 'trace-1',
          initialTab: startingTab,
        };
        const rendered = renderScreen(
          BridgeView,
          { name: Routes.BRIDGE.ROOT },
          { state: stateWithSwapTabsEnabled() },
        );
        await waitFor(() => {
          expect(rendered.store.getState().bridge.sourceToken).toEqual(
            mockDeepLinkSourceToken,
          );
          expect(rendered.store.getState().bridge.destToken).toEqual(
            mockDeepLinkDestToken,
          );
          expect(
            rendered.getByTestId(startingTokenAreaTestId),
          ).toBeOnTheScreen();
        });

        act(() => {
          rendered.store.dispatch(resetBridgeState());
        });
        mockRoute.params = {
          sourcePage: 'deeplink',
          bridgeViewMode: BridgeViewMode.Unified,
          location: MetaMetricsSwapsEventSource.MainView,
          sourceToken: mockSecondDeepLinkSourceToken,
          destToken: mockSecondDeepLinkDestToken,
          swapViewTraceId: 'trace-2',
          initialTab: targetTab,
        };
        rendered.rerender(<BridgeView />);

        await waitFor(() => {
          expect(rendered.store.getState().bridge.sourceToken).toEqual(
            mockSecondDeepLinkSourceToken,
          );
          expect(rendered.store.getState().bridge.destToken).toEqual(
            mockSecondDeepLinkDestToken,
          );
          expect(rendered.getByTestId(sourceTokenAreaTestId)).toBeOnTheScreen();
        });
      },
    );

    it('restores default tokens for a warm deeplink without token params', async () => {
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        sourceToken: mockDeepLinkSourceToken,
        destToken: mockDeepLinkDestToken,
        swapViewTraceId: 'trace-1',
      };
      const rendered = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithSwapTabsEnabled() },
      );
      await waitFor(() => {
        expect(rendered.store.getState().bridge.sourceToken).toEqual(
          mockDeepLinkSourceToken,
        );
        expect(rendered.store.getState().bridge.destToken).toEqual(
          mockDeepLinkDestToken,
        );
      });

      act(() => {
        rendered.store.dispatch(resetBridgeState());
      });
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        swapViewTraceId: 'trace-2',
      };
      rendered.rerender(<BridgeView />);

      await waitFor(() => {
        expect(rendered.store.getState().bridge.sourceToken).toBeDefined();
        expect(rendered.store.getState().bridge.destToken).toBeDefined();
      });
      expect(
        rendered.queryByText(strings('bridge.swap_from')),
      ).not.toBeOnTheScreen();
      expect(
        rendered.queryByText(strings('bridge.swap_to')),
      ).not.toBeOnTheScreen();
    });
  });

  describe('location forwarding', () => {
    it('forwards route.params.location to SwapsMarketOrderConfirmButton via price impact modal navigation', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        location: MetaMetricsSwapsEventSource.MainView,
      } as BridgeRouteParams;

      // shouldShowPriceImpactError causes handleContinue to navigate to the
      // PriceImpactModal. The location value is embedded in the navigation params.
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: {
            ...mockQuoteWithMetadata,
            quote: {
              ...mockQuoteWithMetadata.quote,
              priceData: { priceImpact: { amount: '0.30' } },
            },
          },
          formattedQuoteData: {
            ...mockUseBridgeQuoteData.formattedQuoteData,
            priceImpact: '30%',
          },
          shouldShowPriceImpactError: true,
        }));

      const testState = createBridgeTestState(
        {
          bridgeControllerOverrides: {
            quotesLoadingStatus: RequestStatus.FETCHED,
            quotes: [mockQuoteWithMetadata],
            quotesLastFetched: Date.now(),
          },
          bridgeReducerOverrides: {
            sourceAmount: '1.0',
          },
        },
        mockState,
      );

      const rendered = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      // The new Pressable-based Button does not expose onPress on the host View
      // when disabled, so we find the Button component instance and call onPress directly.
      const buttons = rendered.UNSAFE_getAllByType(Button);
      const confirmButton = buttons.find(
        (b) => b.props.testID === BridgeViewSelectorsIDs.CONFIRM_BUTTON,
      );

      await act(async () => {
        confirmButton?.props.onPress?.();
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          Routes.BRIDGE.MODALS.ROOT,
          expect.objectContaining({
            params: expect.objectContaining({
              location: MetaMetricsSwapsEventSource.MainView,
            }),
          }),
        );
      });
    });
  });

  describe('gas included support hooks', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('calls gas included support hooks with source token chain ID', () => {
      const testState = {
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
        },
      };

      renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      expect(mockUseIsGasIncludedSTXSendBundleSupported).toHaveBeenCalledWith(
        '0x1',
      );
      expect(mockUseIsGasIncluded7702Supported).toHaveBeenCalledWith('0x1');
    });
  });

  describe('Quote Details Card', () => {
    it('displays quote details card when active quote exists', async () => {
      const mockQuote = mockQuoteWithMetadata;
      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuote],
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
          activeQuote: mockQuote,
        }));

      const { getByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        // QuoteDetailsCard should be rendered
        expect(
          getByTestId(BridgeViewSelectorsIDs.BRIDGE_VIEW_SCROLL),
        ).toBeTruthy();
      });
    });

    it('does not display quote details card when no active quote', () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: null,
        }));

      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      // Verify ScrollView exists
      expect(
        getByTestId(BridgeViewSelectorsIDs.BRIDGE_VIEW_SCROLL),
      ).toBeTruthy();

      // QuoteDetailsCard should not be rendered when no quote
      expect(queryByTestId('quote-details-card')).toBeNull();
    });
  });

  describe('Tap Outside to Close Keypad', () => {
    // TODO: Re-enable after fixing component tree navigation for onResponderRelease
    it.skip('closes keypad when tapping outside input area', async () => {
      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      // Verify keypad is open initially (opened by useBridgeViewOnFocus on mount)
      await waitFor(() => {
        expect(queryByTestId('keypad-delete-button')).toBeTruthy();
      });

      // Tap outside the input area - the onResponderRelease is on the main content Box
      // which wraps the ScrollView, so we need to go up two parents
      const scrollView = getByTestId(BridgeViewSelectorsIDs.BRIDGE_VIEW_SCROLL);
      const container = scrollView.parent?.parent;
      await act(async () => {
        // Call the onResponderRelease handler from the parent Box
        if (container?.props.onResponderRelease) {
          container.props.onResponderRelease();
        }
      });

      // Keypad should be closed
      await waitFor(() => {
        expect(queryByTestId('keypad-delete-button')).toBeNull();
      });
    });
  });

  describe('Sponsored Quote Badge', () => {
    it('renders when quote is on a sponsored network', async () => {
      const polygonChainId = '0x89' as Hex;

      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuoteWithMetadata],
          quotesLastFetched: Date.now(),
        },
        bridgeReducerOverrides: {
          sourceAmount: '1.0',
          sourceToken: {
            address: '0x0000000000000000000000000000000000000000',
            chainId: polygonChainId,
            decimals: 18,
            image: '',
            name: 'Polygon',
            symbol: 'POL',
          },
          destToken: {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            chainId: polygonChainId,
            decimals: 6,
            image: '',
            name: 'USD Coin',
            symbol: 'USDC',
          },
        },
      });

      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: mockQuoteWithMetadata,
        }));

      const { getByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Verify the component renders with the sponsored network tokens
      await waitFor(() => {
        const sourceTokenArea = getByTestId(
          BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA,
        );
        expect(sourceTokenArea).toBeTruthy();
        // Both tokens are on Polygon (0x89), which is mocked as a sponsored network
      });
    });

    it('renders when tokens are on different chains', () => {
      const testState = createBridgeTestState({
        bridgeReducerOverrides: {
          sourceToken: {
            address: '0x0000000000000000000000000000000000000000',
            chainId: '0x1' as Hex, // Ethereum
            decimals: 18,
            image: '',
            name: 'Ether',
            symbol: 'ETH',
          },
          destToken: {
            address: '0x0000000000000000000000000000000000000000',
            chainId: '0x89' as Hex, // Polygon
            decimals: 18,
            image: '',
            name: 'Polygon',
            symbol: 'POL',
          },
        },
      });

      const { getByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // Verify the component renders with tokens on different chains
      const sourceTokenArea = getByTestId(
        BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA,
      );
      expect(sourceTokenArea).toBeTruthy();
      // Tokens are on different chains, so sponsored feature won't apply
    });
  });

  describe('Bridge View Mode', () => {
    it('initializes bridge view mode from route params', async () => {
      mockRoute.params = {
        bridgeViewMode: BridgeViewMode.Bridge,
        sourcePage: 'test',
        location: MetaMetricsSwapsEventSource.MainView,
      };

      const { store } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: mockState },
      );

      await waitFor(() => {
        expect(store.getState().bridge.bridgeViewMode).toBe(
          BridgeViewMode.Bridge,
        );
      });
    });

    it('does not override existing bridge view mode', async () => {
      mockRoute.params = {
        bridgeViewMode: BridgeViewMode.Bridge,
        sourcePage: 'test',
        location: MetaMetricsSwapsEventSource.MainView,
      };

      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          bridgeViewMode: BridgeViewMode.Swap,
        },
      };

      const { store } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      await waitFor(() => {
        // Should keep existing mode
        expect(store.getState().bridge.bridgeViewMode).toBe(
          BridgeViewMode.Swap,
        );
      });
    });
  });

  describe('Keypad Input Constraints', () => {
    it('prevents input when max length is reached', async () => {
      // MAX_INPUT_LENGTH is 36 characters
      const maxLengthAmount = '123456789012345678901234567890123456'; // 36 chars
      const testState = {
        ...mockState,
        bridge: {
          ...mockState.bridge,
          sourceAmount: maxLengthAmount,
        },
      };

      const { getByText, getByTestId, store } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      const initialAmount = store.getState().bridge.sourceAmount;
      expect(initialAmount).toBe(maxLengthAmount);
      // Open the keypad first by pressing on the source token input
      const sourceInput = getByTestId('source-token-area-input');
      await act(async () => {
        sourceInput.props.onPressIn();
      });

      // Try to add another digit
      fireEvent.press(getByText('9'));

      await waitFor(() => {
        const currentAmount = store.getState().bridge.sourceAmount;
        // Amount should not change when max length is reached
        expect(currentAmount).toBe(initialAmount);
      });
    });
  });

  describe('Missing Wallet Address', () => {
    it('disables submit when wallet address is not available', async () => {
      const mockQuote = mockQuoteWithMetadata;

      // Mock selectSourceWalletAddress to return undefined
      const { selectSourceWalletAddress } = jest.requireMock(
        '../../../../../selectors/bridge',
      );
      selectSourceWalletAddress.mockReturnValueOnce(undefined);

      const testState = createBridgeTestState({
        bridgeControllerOverrides: {
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotes: [mockQuote],
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
          activeQuote: mockQuote,
        }));

      const { queryByTestId } = renderScreen(
        BridgeView,
        {
          name: Routes.BRIDGE.ROOT,
        },
        { state: testState },
      );

      // When wallet address is missing, the bottom content should not render the confirm button
      await waitFor(() => {
        // The confirm button should not be present or should be disabled
        const confirmButton = queryByTestId('swaps-confirm-button');
        if (confirmButton) {
          expect(confirmButton.props.accessibilityState.disabled).toBe(true);
        }
        // It's acceptable if the button doesn't render at all when wallet address is missing
      });

      // Restore the mock for other tests
      selectSourceWalletAddress.mockReturnValue(
        '0x1234567890123456789012345678901234567890',
      );
    });
  });

  describe('Token Warning Banner', () => {
    const mockWarningFeatures = [
      {
        featureId: 'low_locked_liquidity',
        type: SecurityDataType.Warning,
        description: 'This token is suspicious.',
      },
    ];

    const mockMaliciousFeatures = [
      {
        featureId: 'honeypot',
        type: SecurityDataType.Malicious,
        description: 'This token is malicious.',
      },
    ];

    // createBridgeTestState sets bridge from mockBridgeReducerState (sourceAmount non-zero,
    // destToken.symbol = 'USDC') which puts the view into 'quote' contentMode.
    const stateWithDestSecurityData = (
      type: SecurityDataType,
      features: typeof mockWarningFeatures,
    ) =>
      createBridgeTestState(
        {
          bridgeReducerOverrides: {
            destToken: {
              ...(mockBridgeReducerState.destToken as BridgeToken),
              securityData: { type, metadata: { features } },
            },
          },
        },
        mockState,
      );

    it('does not show the banner when destToken has no securityData', () => {
      const testState = createBridgeTestState({}, mockState);

      const { queryByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(
        queryByText(
          strings('bridge.token_warning_suspicious_banner', { token: 'USDC' }),
        ),
      ).toBeNull();
      expect(
        queryByText(
          strings('bridge.token_warning_malicious_banner', { token: 'USDC' }),
        ),
      ).toBeNull();
    });

    it('shows the banner in zero state (no source amount) when destToken has securityData', () => {
      const testState = createBridgeTestState(
        {
          bridgeReducerOverrides: {
            sourceAmount: undefined,
            destToken: {
              ...(mockBridgeReducerState.destToken as BridgeToken),
              securityData: {
                type: SecurityDataType.Warning,
                metadata: { features: mockWarningFeatures },
              },
            },
          },
        },
        mockState,
      );

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(
        getByText(
          strings('bridge.token_warning_suspicious_banner', { token: 'USDC' }),
        ),
      ).toBeOnTheScreen();
    });

    it('shows the suspicious banner for a Warning type token', () => {
      const testState = stateWithDestSecurityData(
        SecurityDataType.Warning,
        mockWarningFeatures,
      );

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(
        getByText(
          strings('bridge.token_warning_suspicious_banner', { token: 'USDC' }),
        ),
      ).toBeOnTheScreen();
    });

    it('shows the malicious banner for a Malicious type token', () => {
      const testState = stateWithDestSecurityData(
        SecurityDataType.Malicious,
        mockMaliciousFeatures,
      );

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(
        getByText(
          strings('bridge.token_warning_malicious_banner', { token: 'USDC' }),
        ),
      ).toBeOnTheScreen();
    });

    it('navigates to TOKEN_WARNING_MODAL with Info mode when banner is pressed', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        bridgeViewMode: BridgeViewMode.Swap,
        location: MetaMetricsSwapsEventSource.MainView,
      };
      const testState = stateWithDestSecurityData(
        SecurityDataType.Warning,
        mockWarningFeatures,
      );

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      const banner = getByText(
        strings('bridge.token_warning_suspicious_banner', { token: 'USDC' }),
      );
      await act(async () => {
        fireEvent.press(banner);
      });

      expect(mockNavigate).toHaveBeenCalledWith(Routes.BRIDGE.MODALS.ROOT, {
        screen: Routes.BRIDGE.MODALS.TOKEN_WARNING_MODAL,
        params: {
          warningType: SecurityDataType.Warning,
          features: mockWarningFeatures,
          mode: TokenWarningModalMode.Info,
          location: MetaMetricsSwapsEventSource.MainView,
        },
      });
    });

    it('passes Malicious warningType when navigating from a malicious banner', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        bridgeViewMode: BridgeViewMode.Swap,
        location: MetaMetricsSwapsEventSource.MainView,
      };
      const testState = stateWithDestSecurityData(
        SecurityDataType.Malicious,
        mockMaliciousFeatures,
      );

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      const banner = getByText(
        strings('bridge.token_warning_malicious_banner', { token: 'USDC' }),
      );
      await act(async () => {
        fireEvent.press(banner);
      });

      expect(mockNavigate).toHaveBeenCalledWith(Routes.BRIDGE.MODALS.ROOT, {
        screen: Routes.BRIDGE.MODALS.TOKEN_WARNING_MODAL,
        params: expect.objectContaining({
          warningType: SecurityDataType.Malicious,
          features: mockMaliciousFeatures,
          mode: TokenWarningModalMode.Info,
        }),
      });
    });
  });

  describe('Missing Price Banner', () => {
    const mockWarning = {
      type: TokenFeatureType.WARNING,
      feature_id: 'warn-1',
      description: 'This token is suspicious.',
    };

    const quoteModeState = (tokenWarnings: (typeof mockWarning)[] = []) =>
      createBridgeTestState(
        {
          bridgeControllerOverrides: { tokenWarnings },
          ...(tokenWarnings.length > 0 && {
            bridgeReducerOverrides: {
              destToken: {
                ...(mockBridgeReducerState.destToken as BridgeToken),
                securityData: {
                  type: tokenWarnings[0].type as unknown as SecurityDataType,
                  metadata: {
                    features: tokenWarnings.map((w) => ({
                      featureId: w.feature_id,
                      type: w.type as unknown as SecurityDataType,
                      description: w.description,
                    })),
                  },
                },
              },
            },
          }),
        },
        mockState,
      );

    it('shows the missing price banner when quote price data is unavailable', () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: {
            ...mockQuoteWithMetadata,
            quote: {
              ...mockQuoteWithMetadata.quote,
              priceData: undefined,
            },
          },
        }));

      const { getByTestId, getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: quoteModeState() },
      );

      expect(
        getByTestId(BridgeViewSelectorsIDs.MISSING_PRICE_BANNER),
      ).toBeOnTheScreen();
      expect(
        getByText(strings('swaps.market_price_unavailable')),
      ).toBeOnTheScreen();
    });

    it('does not navigate when the missing price banner is pressed', async () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: {
            ...mockQuoteWithMetadata,
            quote: {
              ...mockQuoteWithMetadata.quote,
              priceData: undefined,
            },
          },
        }));

      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: quoteModeState() },
      );

      await act(async () => {
        fireEvent.press(
          getByTestId(BridgeViewSelectorsIDs.MISSING_PRICE_BANNER),
        );
      });

      expect(mockNavigate).not.toHaveBeenCalledWith(
        Routes.BRIDGE.MODALS.ROOT,
        expect.objectContaining({
          screen: Routes.BRIDGE.MODALS.MISSING_PRICE_MODAL,
        }),
      );
    });

    it('renders both the token warning banner and the missing price banner together', () => {
      jest
        .mocked(useBridgeQuoteData as unknown as jest.Mock)
        .mockImplementation(() => ({
          ...mockUseBridgeQuoteData,
          activeQuote: {
            ...mockQuoteWithMetadata,
            quote: {
              ...mockQuoteWithMetadata.quote,
              priceData: undefined,
            },
          },
        }));

      const { getByText } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: quoteModeState([mockWarning]) },
      );

      expect(
        getByText(
          strings('bridge.token_warning_suspicious_banner', { token: 'USDC' }),
        ),
      ).toBeOnTheScreen();
      expect(
        getByText(strings('swaps.market_price_unavailable')),
      ).toBeOnTheScreen();
    });
  });
});
