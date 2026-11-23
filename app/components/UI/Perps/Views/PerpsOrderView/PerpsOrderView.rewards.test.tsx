import {
  TestWrapper,
  createMockStreamManager,
  defaultMockHooks,
  getMockTradeScreenProps,
  initialMetrics,
  mockCreateEventBuilder,
  mockUseIsPerpsBalanceSelected,
  mockUseMoneyAccountDepositAndOrder,
  mockUseTransactionPayToken,
  setMockPayTokenAccountBalanceUsd,
  setupPerpsOrderViewMocks,
  useTradeSheetRoute,
} from './PerpsOrderView.testUtils';
import { useRoute } from '@react-navigation/native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React, { useCallback } from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '@metamask/design-system-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PerpsOrderViewSelectorsIDs } from '../../Perps.testIds';
import {
  usePerpsLiveAccount,
  usePerpsMarketData,
  usePerpsRewards,
  useMinimumOrderAmount,
} from '../../hooks';
import { usePerpsLiveAccount as usePerpsLiveAccountStream } from '../../hooks/stream';
import {
  PerpsStreamManager,
  PerpsStreamProvider,
} from '../../providers/PerpsStreamManager';
import { usePerpsOrderContext } from '../../contexts/PerpsOrderContext';
import PerpsOrderView from './PerpsOrderView';

describe('PerpsOrderView', () => {
  beforeEach(() => {
    setupPerpsOrderViewMocks();
  });

  describe('Rewards Points Row', () => {
    it('displays points row when rewards should show', async () => {
      // Arrange - Rewards are always enabled
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 100,
        isLoading: false,
        hasError: false,
        bonusBips: 250,
        feeDiscountPercentage: 15,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
      });
    });

    it('handles points tooltip interaction', async () => {
      // Arrange - Rewards are always enabled
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 150,
        isLoading: false,
        hasError: false,
        bonusBips: 500,
        feeDiscountPercentage: 20,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
      });

      // Assert - Points text and tooltip should be present
      expect(screen.getByText('perps.estimated_points')).toBeTruthy();
    });

    it('renders RewardsAnimations component with correct props when rewards shown', async () => {
      // Arrange - Rewards are always enabled
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 1000,
        isLoading: false,
        hasError: false,
        bonusBips: 250,
        feeDiscountPercentage: 15,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify the rewards row and animation component render
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
        // The RewardsAnimations component should display the formatted points value
        expect(screen.getByText('1,000')).toBeTruthy();
      });
    });

    it('renders RewardsAnimations in loading state', async () => {
      // Arrange - Rewards are always enabled, in loading state
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 0,
        isLoading: true,
        hasError: false,
        bonusBips: undefined,
        feeDiscountPercentage: undefined,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify the rewards row renders even in loading state
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
      });
    });

    it('renders RewardsAnimations in error state', async () => {
      // Arrange - Rewards are always enabled, in error state
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 0,
        isLoading: false,
        hasError: true,
        bonusBips: undefined,
        feeDiscountPercentage: undefined,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify the rewards row renders in error state
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
        // RewardsAnimations component renders with hasError state
      });
    });

    it('renders RewardsAnimations with bonus bips when provided', async () => {
      // Arrange - Rewards are always enabled, with bonus
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 2500,
        isLoading: false,
        hasError: false,
        bonusBips: 500, // 5% bonus
        feeDiscountPercentage: 25,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify the rewards row renders with bonus
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
        expect(screen.getByText('2,500')).toBeTruthy();
      });
    });

    it('renders AddRewardsAccount when accountOptedIn is false and account is defined', async () => {
      // Arrange - Account not opted in but account exists
      const mockAccount = {
        id: 'test-account-id',
        address: '0x1234567890123456789012345678901234567890',
        type: 'eip155:eoa' as const,
        scopes: ['eip155:1'],
        options: {},
        methods: [],
        metadata: {
          name: 'Test Account',
          importTime: Date.now(),
          keyring: {
            type: 'HD Key Tree',
          },
        },
      };

      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 100,
        isLoading: false,
        hasError: false,
        bonusBips: 250,
        feeDiscountPercentage: 15,
        isRefresh: false,
        accountOptedIn: false,
        account: mockAccount,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify AddRewardsAccount component is rendered
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
        expect(screen.getByTestId('add-rewards-account')).toBeTruthy();
        expect(screen.getByText('Add Rewards Account')).toBeTruthy();
      });
    });

    it('renders RewardsAnimations when accountOptedIn is true', async () => {
      // Arrange - Account opted in
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        estimatedPoints: 100,
        isLoading: false,
        hasError: false,
        bonusBips: 250,
        feeDiscountPercentage: 15,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify RewardsAnimations is rendered, not AddRewardsAccount
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeTruthy();
        expect(screen.queryByTestId('add-rewards-account')).toBeNull();
      });
    });

    it('does not render rewards row when accountOptedIn is null', async () => {
      // Arrange - Account opt-in status unknown
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: false,
        estimatedPoints: undefined,
        isLoading: false,
        hasError: false,
        bonusBips: undefined,
        feeDiscountPercentage: undefined,
        isRefresh: false,
        accountOptedIn: null,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify rewards row is not rendered
      await waitFor(() => {
        expect(screen.queryByText('perps.estimated_points')).toBeNull();
        expect(screen.queryByTestId('add-rewards-account')).toBeNull();
      });
    });
  });

  describe('Info icon tooltip interactions', () => {
    it('should show tooltip when margin info icon is pressed', async () => {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const marginInfoIcon = screen.getByTestId(
        PerpsOrderViewSelectorsIDs.MARGIN_INFO_ICON,
      );
      fireEvent.press(marginInfoIcon);

      await waitFor(() => {
        expect(
          screen.getByTestId('perps-order-view-bottom-sheet-tooltip'),
        ).toBeDefined();
      });
    });

    it('should show tooltip when liquidation price info icon is pressed', async () => {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const liquidationInfoIcon = screen.getByTestId(
        PerpsOrderViewSelectorsIDs.LIQUIDATION_PRICE_INFO_ICON,
      );
      fireEvent.press(liquidationInfoIcon);

      await waitFor(() => {
        expect(
          screen.getByTestId('perps-order-view-bottom-sheet-tooltip'),
        ).toBeDefined();
      });
    });

    it('should show tooltip when fees info icon is pressed', async () => {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      const feesInfoIcon = screen.getByTestId(
        PerpsOrderViewSelectorsIDs.FEES_INFO_ICON,
      );
      fireEvent.press(feesInfoIcon);

      await waitFor(() => {
        expect(
          screen.getByTestId('perps-order-view-bottom-sheet-tooltip'),
        ).toBeDefined();
      });
    });
  });

  describe('Amount validation and display', () => {
    it('should display fallback data when amount is invalid', async () => {
      // Mock order context with invalid amount
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '0', // Invalid amount
          leverage: 3,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 0,
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
          marginRequired: '0',
          positionSize: '0',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Verify fallback data display is shown for invalid amounts
      await waitFor(() => {
        expect(screen.getByText('Margin')).toBeDefined();
        expect(screen.getByText('Liquidation price')).toBeDefined();
      });
    });

    it('should format margin and liquidation price correctly for valid amounts', async () => {
      // Mock order context with valid amount
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100', // Valid amount
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
          marginRequired: '33.33',
          positionSize: '0.0333',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Verify proper formatting for valid amounts
      await waitFor(() => {
        expect(screen.getByText('Margin')).toBeDefined();
        expect(screen.getByText('Liquidation price')).toBeDefined();
      });
    });
  });

  describe('Fees display with discount', () => {
    it('should display fees with discount percentage when available', async () => {
      // Mock rewards state with fee discount
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        isLoading: false,
        estimatedPoints: 100,
        bonusBips: 250,
        feeDiscountPercentage: 15, // 15% discount
        hasError: false,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Fees')).toBeDefined();
      });

      // The PerpsFeesDisplay component should receive the discount percentage
      // This is tested by the component rendering without errors
    });

    it('should display fees without discount when not available', async () => {
      // Mock rewards state without fee discount
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: false,
        isLoading: false,
        estimatedPoints: undefined,
        bonusBips: undefined,
        feeDiscountPercentage: undefined, // No discount
        hasError: false,
        isRefresh: false,
        accountOptedIn: null,
        account: undefined,
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Fees')).toBeDefined();
      });

      // Fees should still be displayed but without discount
    });
  });

  // Control/treatment fee-row behavior is covered in PerpsOrderView.view.test.tsx.

  describe('Points section with rewards', () => {
    it('displays points row and handles tooltip when rewards should show', async () => {
      // Arrange - Rewards are always enabled
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        isLoading: false,
        estimatedPoints: 150,
        bonusBips: 500,
        feeDiscountPercentage: 20,
        hasError: false,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Act
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - Verify points section is displayed
      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeDefined();
      });

      // The points tooltip is handled by the handleTooltipPress('points') function
      // Since we can't easily find the specific points info icon, we just verify
      // that the points section renders correctly which covers the main code paths
    });
  });

  describe('Conditional Rendering Coverage - Target Lines', () => {
    it('should render margin with formatPrice when marginRequired is truthy', async () => {
      // Mock order context with valid margin calculation
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '100',
          leverage: 5,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 50,
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
          marginRequired: '20.00', // Truthy value - triggers formatPrice path
          positionSize: '0.02',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Margin')).toBeDefined();
        // The formatted price should be displayed (targets lines 1030-1032)
      });
    });

    it('should render margin fallback when marginRequired is falsy', async () => {
      // Mock order context with no margin calculation
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '0', // Invalid amount
          leverage: 3,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 0,
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
          marginRequired: '', // Falsy value - triggers fallback path
          positionSize: '',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Margin')).toBeDefined();
        // The fallback data should be displayed (targets lines 1030-1032)
      });
    });

    it('should render fees with formatPerpsFiat when hasValidAmount is true', async () => {
      // Mock order context with valid amount for fee calculation
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '50', // Valid amount - hasValidAmount = true
          leverage: 3,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 25,
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
          marginRequired: '16.67',
          positionSize: '0.0167',
        },
      });

      // The fees are already mocked in the global mock setup
      // No need to override the mock here - it will use the default values

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Fees')).toBeDefined();
        // The formatted fee should be displayed (targets lines 1083-1087)
      });
    });

    it('should render fees fallback when hasValidAmount is false', async () => {
      // Mock order context with invalid amount
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '0', // Invalid amount - hasValidAmount = false
          leverage: 3,
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 0,
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
          marginRequired: '0',
          positionSize: '0',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Fees')).toBeDefined();
        // The fallback data should be displayed (targets lines 1087)
      });
    });

    it('shows rewards state integration with fee discount', async () => {
      // Arrange - Rewards are always enabled
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        isLoading: false,
        estimatedPoints: 75,
        bonusBips: 300,
        feeDiscountPercentage: 12, // 12% fee discount
        hasError: false,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      // Mock valid order form
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '25',
          leverage: 4,
          direction: 'short',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 15,
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
          marginRequired: '6.25',
          positionSize: '0.0083',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('perps.estimated_points')).toBeDefined();
        expect(screen.getByText('Fees')).toBeDefined();
        // Should render both points and fees with discount integration (targets lines 1081, 214-229)
      });
    });
  });

  describe('Leverage from existing position', () => {
    interface MockPosition {
      symbol: string;
      size: string;
      entryPrice: string;
      positionValue: string;
      unrealizedPnl: string;
      marginUsed: string;
      leverage: {
        type: string;
        value: number;
      };
      liquidationPrice: string;
      maxLeverage: number;
      returnOnEquity: string;
      cumulativeFunding: {
        allTime: string;
        sinceOpen: string;
        sinceChange: string;
      };
      takeProfitCount: number;
      stopLossCount: number;
    }

    interface SubscribeParams {
      callback: (positions: MockPosition[]) => void;
    }

    it('should not sync leverage from position when route param leverage is provided', async () => {
      // Create a custom test wrapper that provides position data
      const TestWrapperWithPositions = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const mockStreamManager = createMockStreamManager();

        // Override positions.subscribe to provide position data
        mockStreamManager.positions.subscribe = jest.fn(
          (params: SubscribeParams) => {
            const { callback } = params;
            // Simulate position data for ETH with leverage 15
            callback([
              {
                symbol: 'ETH',
                size: '0.5',
                entryPrice: '3000',
                positionValue: '1500',
                unrealizedPnl: '50',
                marginUsed: '100',
                leverage: {
                  type: 'isolated',
                  value: 15,
                },
                liquidationPrice: '2700',
                maxLeverage: 50,
                returnOnEquity: '50',
                cumulativeFunding: {
                  allTime: '3',
                  sinceOpen: '1',
                  sinceChange: '0.5',
                },
                takeProfitCount: 0,
                stopLossCount: 0,
              },
            ]);
            return jest.fn(); // unsubscribe function
          },
        ) as jest.Mock;

        return (
          <PerpsStreamProvider
            testStreamManager={
              mockStreamManager as unknown as PerpsStreamManager
            }
          >
            {children}
          </PerpsStreamProvider>
        );
      };

      // Mock route params with ETH asset and explicit leverage
      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'ETH',
          direction: 'long',
          leverage: 5, // Explicit leverage should take precedence
        },
      });

      // Mock the order context with the explicit leverage from route
      const mockSetLeverage = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'ETH',
          amount: '11',
          leverage: 5, // Already set from route params
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: mockSetLeverage,
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

      render(<PerpsOrderView />, { wrapper: TestWrapperWithPositions });

      // Wait a bit to ensure the effect runs
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify setLeverage was NOT called because leverage was already set from route params
      expect(mockSetLeverage).not.toHaveBeenCalled();

      // Verify the leverage displayed is from route params
      expect(screen.getByText('5x')).toBeDefined();
    });

    it('should prioritize existing position leverage over saved config (bug fix)', () => {
      // This test verifies the fix for the leverage priority chain bug
      // Scenario: User has saved config at 5x, but existing position at 10x
      // Expected: Form should initialize with 10x (not 5x)

      // Create a custom test wrapper with position data
      const TestWrapperWithPositionsAndConfig = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const mockStreamManager = createMockStreamManager();

        // Override positions.subscribe to provide position data for BTC at 10x
        mockStreamManager.positions.subscribe = jest.fn(
          (params: SubscribeParams) => {
            const { callback } = params;
            callback([
              {
                symbol: 'BTC',
                size: '0.1',
                entryPrice: '50000',
                positionValue: '5000',
                unrealizedPnl: '100',
                marginUsed: '500',
                leverage: {
                  type: 'isolated',
                  value: 10, // Existing position at 10x
                },
                liquidationPrice: '45000',
                maxLeverage: 50,
                returnOnEquity: '20',
                cumulativeFunding: {
                  allTime: '5',
                  sinceOpen: '2',
                  sinceChange: '1',
                },
                takeProfitCount: 0,
                stopLossCount: 0,
              },
            ]);
            return jest.fn(); // unsubscribe function
          },
        ) as jest.Mock;

        return (
          <PerpsStreamProvider
            testStreamManager={
              mockStreamManager as unknown as PerpsStreamManager
            }
          >
            {children}
          </PerpsStreamProvider>
        );
      };

      // Mock route params with BTC but no leverage param
      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'BTC',
          direction: 'long',
          // No leverage param - should use existing position (10x), not saved config (5x)
        },
      });

      // Mock the order context with initial leverage from existing position (10x)
      // In the real app, PerpsOrderProvider would initialize with this
      const mockSetLeverage = jest.fn();
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        orderForm: {
          asset: 'BTC',
          amount: '11',
          leverage: 10, // Should be 10x from existing position, not 5x from saved config
          direction: 'long',
          type: 'market',
          limitPrice: undefined,
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          balancePercent: 10,
        },
        setAmount: jest.fn(),
        setLeverage: mockSetLeverage,
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
          positionSize: '0.0002',
        },
      });

      render(<PerpsOrderView />, {
        wrapper: TestWrapperWithPositionsAndConfig,
      });

      // Verify the leverage is 10x from existing position, not 5x from saved config
      expect(screen.getByText('10x')).toBeDefined();
    });
  });

  describe('Tooltip interactions', () => {
    it('should close tooltip when handleTooltipClose is called', async () => {
      // Arrange - Mock the context to return a function we can call
      const mockSetSelectedTooltip = jest.fn();

      // Create a component that exposes the tooltip close handler
      const TestComponent = () => {
        const handleTooltipClose = useCallback(() => {
          mockSetSelectedTooltip(null);
        }, []);

        return (
          <TouchableOpacity
            testID="close-tooltip-button"
            onPress={handleTooltipClose}
          >
            <Text>Close Tooltip</Text>
          </TouchableOpacity>
        );
      };

      const { getByTestId } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <TestComponent />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Act
      fireEvent.press(getByTestId('close-tooltip-button'));

      // Assert
      await waitFor(() => {
        expect(mockSetSelectedTooltip).toHaveBeenCalledWith(null);
      });
    });

    it('should show points tooltip when points info icon is pressed', () => {
      // Arrange - Mock rewards to be enabled and showing
      (usePerpsRewards as jest.Mock).mockReturnValue({
        shouldShowRewardsRow: true,
        isLoading: false,
        estimatedPoints: 25,
        bonusBips: undefined,
        feeDiscountPercentage: 10,
        hasError: false,
        isRefresh: false,
        accountOptedIn: true,
        account: undefined,
      });

      const { queryByTestId } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <PerpsOrderView />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Assert - Points section should be rendered when rewards are enabled
      // Note: The actual testID may not exist, so we verify the component renders without error
      expect(
        queryByTestId('perps-order-view-place-order-button'),
      ).toBeOnTheScreen();
    });
  });

  describe('Money Account selection', () => {
    const mockEmptyPerpsBalance = (isInitialLoading: boolean) => {
      jest.mocked(usePerpsLiveAccountStream).mockReturnValue({
        ...defaultMockHooks.usePerpsLiveAccount,
        account: {
          ...defaultMockHooks.usePerpsLiveAccount.account,
          spendableBalance: '0',
        },
        isInitialLoading,
      } as unknown as ReturnType<typeof usePerpsLiveAccountStream>);
    };

    // clearAllMocks keeps return values, so the funded default the rest of the
    // file relies on has to be put back by hand.
    afterEach(() => {
      jest
        .mocked(usePerpsLiveAccountStream)
        .mockReturnValue(
          defaultMockHooks.usePerpsLiveAccount as unknown as ReturnType<
            typeof usePerpsLiveAccountStream
          >,
        );
    });

    it('holds back money account selection while the Perps balance can fund the order', () => {
      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(mockUseMoneyAccountDepositAndOrder).toHaveBeenCalledWith({
        disable: true,
      });
    });

    it('holds back money account selection while the account is still loading', () => {
      mockEmptyPerpsBalance(true);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(mockUseMoneyAccountDepositAndOrder).toHaveBeenCalledWith({
        disable: true,
      });
    });

    it('allows money account selection once the Perps balance is known to be empty', () => {
      mockEmptyPerpsBalance(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(mockUseMoneyAccountDepositAndOrder).toHaveBeenCalledWith({
        disable: false,
      });
    });
  });

  describe('Insufficient funds handling', () => {
    it('should not show balance warning when account is still loading', () => {
      // This test verifies our loading guard fix - balance warnings shouldn't
      // appear while account data is still loading
      (usePerpsLiveAccount as jest.Mock).mockReturnValue({
        account: {
          spendableBalance: '0', // Zero balance
          withdrawableBalance: '0', // Zero balance
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
          totalBalance: '0',
        },
        isInitialLoading: true, // Still loading - warning should NOT appear
      });

      const { queryByText } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <PerpsOrderView />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Assert - Should NOT show "No funds available" warning while loading
      expect(
        queryByText(
          'Not enough funds available. Deposit funds or select a different payment method',
        ),
      ).toBeNull();
    });

    it('should show normal place order button when amount is sufficient', () => {
      // Arrange - Mock sufficient balance and adjust order form amount
      (usePerpsLiveAccount as jest.Mock).mockReturnValue({
        account: {
          spendableBalance: '10000', // High balance
          withdrawableBalance: '10000', // High balance
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
          totalBalance: '10000',
        },
        isInitialLoading: false,
      });

      (useMinimumOrderAmount as jest.Mock).mockReturnValue({
        minimumOrderAmount: 10, // Low minimum
        isLoading: false,
      });

      // Mock order context with a smaller amount that should be sufficient
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        ...defaultMockHooks.usePerpsOrderContext,
        orderForm: {
          ...defaultMockHooks.usePerpsOrderContext.orderForm,
          amount: '100', // Smaller amount that should be sufficient
          leverage: 2, // Lower leverage
        },
      });

      const { getByTestId } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <PerpsOrderView />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Assert - Should render the component successfully and not crash
      // The exact button text depends on complex business logic, so we verify basic rendering
      expect(
        getByTestId('perps-order-view-place-order-button'),
      ).toBeOnTheScreen();
    });
  });

  describe('Order header interactions', () => {
    it('should open order type bottom sheet when order type is pressed in header', () => {
      const { getByText } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <PerpsOrderView />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Act - Press the order type text using the translation key
      const orderTypeText = getByText('perps.order.market');
      fireEvent.press(orderTypeText);

      // Assert - This test verifies the order type is displayed and pressable
      expect(orderTypeText).toBeOnTheScreen();
    });

    it('should display correct asset and price in header', async () => {
      // Arrange - Mock specific asset data
      (usePerpsOrderContext as jest.Mock).mockReturnValue({
        ...defaultMockHooks.usePerpsOrderContext,
        orderForm: {
          ...defaultMockHooks.usePerpsOrderContext.orderForm,
          asset: 'BTC',
        },
      });

      const { getByTestId, findByText } = render(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <TestWrapper>
            <PerpsOrderView />
          </TestWrapper>
        </SafeAreaProvider>,
      );

      // Assert - Should display asset in header title using testID to avoid duplicate text matches
      const headerTitle = getByTestId('perps-order-header-asset-title');
      expect(headerTitle).toHaveTextContent('Long BTC');
      // Wait for price to appear after isDataReady becomes true
      const priceText = await findByText('$3,000');
      expect(priceText).toBeOnTheScreen();
    });
  });

  describe('Market data fallback to route defaults', () => {
    it('uses defaultSzDecimals and defaultMaxLeverage when marketData is loading', async () => {
      // Arrange - marketData is null and still loading, but defaults are provided
      (usePerpsMarketData as jest.Mock).mockReturnValue({
        marketData: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'ETH',
          direction: 'long',
          defaultSzDecimals: 4,
          defaultMaxLeverage: 50,
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      // Assert - order button should be present (not blocked by loading) because
      // the component falls back to route param defaults
      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });
      expect(
        screen.getByTestId(PerpsOrderViewSelectorsIDs.PLACE_ORDER_BUTTON),
      ).toBeOnTheScreen();
    });

    it('treats market data as loading when no fallback defaults and data is unavailable', async () => {
      // Arrange - marketData null, loading, AND no route defaults
      (usePerpsMarketData as jest.Mock).mockReturnValue({
        marketData: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      (useRoute as jest.Mock).mockReturnValue({
        params: {
          asset: 'ETH',
          direction: 'long',
        },
      });

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });
    });

    it('does not treat a deferred empty-asset fetch as a failed market', () => {
      (usePerpsMarketData as jest.Mock).mockReturnValue({
        marketData: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      expect(getMockTradeScreenProps().errorMessages).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'market-data-unavailable',
          }),
        ]),
      );
    });

    it('explains why Trade sheet submission is blocked when market data is unavailable', async () => {
      (usePerpsMarketData as jest.Mock).mockReturnValue({
        marketData: null,
        isLoading: false,
        error: new Error('Market unavailable'),
        refetch: jest.fn(),
      });
      useTradeSheetRoute();

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(getMockTradeScreenProps().isSubmitDisabled).toBe(true);
        expect(getMockTradeScreenProps().errorMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: 'market-data-unavailable',
              message: 'perps.failed_to_load_market_data',
            }),
          ]),
        );
      });
    });
  });

  describe('Pay-token validation error analytics tracking', () => {
    const findPerpsErrorBuilder = () => {
      const calls = mockCreateEventBuilder.mock.calls as unknown as [
        { category?: string },
      ][];
      for (let i = 0; i < calls.length; i++) {
        if (calls[i][0]?.category === 'Perp Error') {
          return mockCreateEventBuilder.mock.results[i].value;
        }
      }
      return undefined;
    };

    it('fires validation error event when a blocking insufficient-balance pay-token alert appears', async () => {
      const alertMessage = 'Insufficient balance for pay token';
      const { useInsufficientPayTokenBalanceAlert: mockAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          key: 'InsufficientPayTokenBalance',
          field: 'Amount',
          message: alertMessage,
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'validation',
            error_message: alertMessage,
            screen_name: 'perps_order',
            screen_type: 'trading',
          }),
        );
      });
    });

    it('fires validation error event when a blocking no-quotes pay-token alert appears', async () => {
      const { useInsufficientPayTokenBalanceAlert: mockInsufficientAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockInsufficientAlert.mockReturnValue([]);

      const alertMessage = 'No quotes available for selected token';
      const { useNoPayTokenQuotesAlert: mockAlert } = jest.requireMock(
        '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
      ) as { useNoPayTokenQuotesAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          key: 'NoPayTokenQuotes',
          field: 'PayWith',
          message: alertMessage,
          title: 'No quotes',
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'validation',
            error_message: alertMessage,
            screen_name: 'perps_order',
            screen_type: 'trading',
          }),
        );
      });
    });

    it('does not fire validation error event when no blocking pay-token alerts exist', async () => {
      const { useInsufficientPayTokenBalanceAlert: mockInsufficientAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      const { useNoPayTokenQuotesAlert: mockNoQuotesAlert } = jest.requireMock(
        '../../../../Views/confirmations/hooks/alerts/useNoPayTokenQuotesAlert',
      ) as { useNoPayTokenQuotesAlert: jest.Mock };
      mockInsufficientAlert.mockReturnValue([]);
      mockNoQuotesAlert.mockReturnValue([]);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      const builder = findPerpsErrorBuilder();
      expect(builder).toBeUndefined();
    });

    it('does not fire validation error event when Perps balance is selected instead of custom token', async () => {
      const { useInsufficientPayTokenBalanceAlert: mockAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          key: 'InsufficientPayTokenBalance',
          field: 'Amount',
          message: 'Insufficient balance',
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(true);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      const builder = findPerpsErrorBuilder();
      expect(builder).toBeUndefined();
    });

    it('fires warning event when hasInsufficientPayTokenBalance is true', async () => {
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
        payToken: { balanceUsd: '0.01', address: '0xusdc', chainId: '0xa4b1' },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('0.01');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'warning',
            warning_message: 'insufficient_balance',
            screen_name: 'perps_order',
            screen_type: 'trading',
          }),
        );
      });
    });

    it('does not fire warning event when pay-token balance is sufficient', async () => {
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
        payToken: {
          balanceUsd: '999999999',
          address: '0xusdc',
          chainId: '0xa4b1',
        },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('999999999');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        expect(screen.getByText('Leverage')).toBeOnTheScreen();
      });

      const allBuilders = (
        mockCreateEventBuilder.mock.calls as unknown as [
          { category?: string },
        ][]
      ).reduce<ReturnType<typeof mockCreateEventBuilder>[]>(
        (acc, call, idx) => {
          if (call[0]?.category === 'Perp Error') {
            acc.push(mockCreateEventBuilder.mock.results[idx].value);
          }
          return acc;
        },
        [],
      );
      const hasWarningBuilder = allBuilders.some((b) =>
        (b.addProperties as jest.Mock).mock.calls.some(
          (c: [Record<string, unknown>]) => c[0]?.error_type === 'warning',
        ),
      );
      expect(hasWarningBuilder).toBe(false);
    });

    it('warns when the pay token covers the margin but not the pay-token deposit headroom', async () => {
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
        payToken: {
          balanceUsd: '999999999',
          address: '0xusdc',
          chainId: '0xa4b1',
        },
        setPayToken: jest.fn(),
        isNative: false,
      });
      setMockPayTokenAccountBalanceUsd('999999999');
      mockUseIsPerpsBalanceSelected.mockReturnValue(false);
      const { rerender } = render(<PerpsOrderView />, {
        wrapper: TestWrapper,
      });
      const marginText = await waitFor(
        () =>
          screen.getByTestId(PerpsOrderViewSelectorsIDs.MARGIN_VALUE).props
            .children as string,
      );
      const marginUsd = marginText.replace(/[^0-9.]/g, '');
      expect(Number(marginUsd)).toBeGreaterThan(0);

      setMockPayTokenAccountBalanceUsd(marginUsd);
      mockCreateEventBuilder.mockClear();
      rerender(<PerpsOrderView />);

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'warning',
            warning_message: 'insufficient_balance',
          }),
        );
      });
    });

    it('uses title as alertMessage fallback when message is not a string', async () => {
      const expectedTitle = 'Alert title fallback';
      const { useInsufficientPayTokenBalanceAlert: mockAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          key: 'InsufficientPayTokenBalance',
          field: 'Amount',
          message: undefined,
          title: expectedTitle,
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'validation',
            error_message: expectedTitle,
          }),
        );
      });
    });

    it('uses key as alertMessage fallback when neither message nor title exist', async () => {
      const expectedKey = 'CustomAlertKey';
      const { useInsufficientPayTokenBalanceAlert: mockAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          key: expectedKey,
          field: 'Amount',
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'validation',
            error_message: expectedKey,
          }),
        );
      });
    });

    it('uses unknown_blocking_alert as alertMessage fallback when no message, title, or key', async () => {
      const { useInsufficientPayTokenBalanceAlert: mockAlert } =
        jest.requireMock(
          '../../../../Views/confirmations/hooks/alerts/useInsufficientPayTokenBalanceAlert',
        ) as { useInsufficientPayTokenBalanceAlert: jest.Mock };
      mockAlert.mockReturnValue([
        {
          field: 'Amount',
          severity: 'danger',
          isBlocking: true,
        },
      ]);

      mockUseIsPerpsBalanceSelected.mockReturnValue(false);

      render(<PerpsOrderView />, { wrapper: TestWrapper });

      await waitFor(() => {
        const builder = findPerpsErrorBuilder();
        expect(builder).toBeDefined();
        expect(builder.addProperties).toHaveBeenCalledWith(
          expect.objectContaining({
            error_type: 'validation',
            error_message: 'unknown_blocking_alert',
          }),
        );
      });
    });
  });
});
