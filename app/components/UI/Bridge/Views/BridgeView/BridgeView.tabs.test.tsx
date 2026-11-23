import {
  BridgeView,
  mockGoBack,
  mockRoute,
  mockSetParams,
  mockState,
  setupBridgeViewMocks,
} from './BridgeView.testUtils';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { merge } from 'lodash';
import {
  renderScreen,
  DeepPartial,
} from '../../../../../util/test/renderWithProvider';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { ReactTestInstance } from 'react-test-renderer';
import Routes from '../../../../../constants/navigation/Routes';
import type { BridgeRouteParams } from '../../hooks/useSwapBridgeNavigation';
import { BridgeViewMode } from '../../types';
import { MetaMetricsSwapsEventSource } from '@metamask/bridge-controller';
import { strings } from '../../../../../../locales/i18n';
import { BridgeViewSelectorsIDs } from './BridgeView.testIds';
import { RootState } from '../../../../../reducers';
import Engine from '../../../../../core/Engine';
import { BridgeTabKey } from './BridgeView.constants';
import { OrdersTabsSelectorsIDs } from '../../components/OrdersTabs/OrdersTabs.testIds';

describe('BridgeView', () => {
  beforeEach(() => {
    setupBridgeViewMocks();
  });

  describe('Tab swipe navigation', () => {
    const stateWithTabsEnabled = () =>
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

    const swipe = async (translationX: number, velocityX = 0) => {
      await act(async () => {
        fireGestureHandler(
          getByGestureTestId(BridgeViewSelectorsIDs.FIRST_PAGE_SWIPE_GESTURE),
          [{ translationX, velocityX }],
        );
        await Promise.resolve();
      });
    };

    // The native pager never reports scrolling in Jest, so tests drive its
    // events directly.
    const firePagerEvent = async (
      getByTestId: (testID: string) => ReactTestInstance,
      eventName: 'pageScroll' | 'pageSelected' | 'pageScrollStateChanged',
      nativeEvent: Record<string, unknown>,
    ) => {
      await act(async () => {
        fireEvent(getByTestId(BridgeViewSelectorsIDs.TABS_CONTENT), eventName, {
          nativeEvent,
        });
      });
    };

    const settlePager = (getByTestId: (testID: string) => ReactTestInstance) =>
      firePagerEvent(getByTestId, 'pageScrollStateChanged', {
        pageScrollState: 'idle',
      });

    // Records every pager render, since the native pager only reads
    // `initialPage` when it mounts.
    const spyOnPagerRenders = () => {
      const renders: { pager: PagerView; initialPage?: number }[] = [];
      const originalRender = PagerView.prototype.render;
      jest.spyOn(PagerView.prototype, 'render').mockImplementation(function (
        this: PagerView,
      ) {
        renders.push({ pager: this, initialPage: this.props.initialPage });
        return originalRender.call(this);
      });
      return renders;
    };

    const setTabFlags = async (
      store: ReturnType<typeof renderScreen>['store'],
      { limit, recurring }: { limit: boolean; recurring: boolean },
    ) => {
      const { RemoteFeatureFlagController } =
        store.getState().engine.backgroundState;
      Object.assign(Engine, {
        state: {
          RemoteFeatureFlagController: {
            ...RemoteFeatureFlagController,
            remoteFeatureFlags: {
              ...RemoteFeatureFlagController.remoteFeatureFlags,
              swapsLimitOrder: { enabled: limit },
              swapsRecurringBuy: { enabled: recurring },
            },
          },
        },
      });
      await act(async () => {
        store.dispatch({
          type: 'UPDATE_BG_STATE',
          payload: { key: 'RemoteFeatureFlagController' },
        });
      });
    };

    afterEach(() => {
      jest.restoreAllMocks();
      delete (Engine as { state?: unknown }).state;
    });

    it('remounts the pager on the selected tab when a tab is inserted before it', async () => {
      const recurringOnlyState = merge({}, mockState, {
        engine: {
          backgroundState: {
            RemoteFeatureFlagController: {
              remoteFeatureFlags: { swapsRecurringBuy: { enabled: true } },
            },
          },
        },
      }) as DeepPartial<RootState>;
      const renders = spyOnPagerRenders();
      const { getByTestId, store } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: recurringOnlyState },
      );
      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.RECURRING_TAB));
      await settlePager(getByTestId);
      const pagerBeforeInsert = renders[renders.length - 1].pager;

      await setTabFlags(store, { limit: true, recurring: true });

      const lastRender = renders[renders.length - 1];
      expect(lastRender.pager === pagerBeforeInsert).toBe(false);
      expect(lastRender.initialPage).toBe(2);
      expect(
        getByTestId(BridgeViewSelectorsIDs.RECURRING_BUY_CONTAINER),
      ).toBeOnTheScreen();
    });

    it('keeps the selected tab when a tab before it is removed', async () => {
      const renders = spyOnPagerRenders();
      const { getByTestId, queryByTestId, store } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );
      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.RECURRING_TAB));
      await settlePager(getByTestId);
      const pagerBeforeRemoval = renders[renders.length - 1].pager;

      await setTabFlags(store, { limit: false, recurring: true });
      // The remounted pager reports the page it mounted on.
      await firePagerEvent(getByTestId, 'pageSelected', { position: 1 });
      await settlePager(getByTestId);

      const lastRender = renders[renders.length - 1];
      expect(lastRender.pager === pagerBeforeRemoval).toBe(false);
      expect(lastRender.initialPage).toBe(1);
      expect(queryByTestId(BridgeViewSelectorsIDs.LIMIT_TAB)).toBeNull();
      expect(
        getByTestId(BridgeViewSelectorsIDs.RECURRING_BUY_CONTAINER),
      ).toBeOnTheScreen();
    });

    it('opens the initial tab requested by the route', async () => {
      mockRoute.params = {
        sourcePage: 'TokenDetails',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.TokenView,
        initialTab: BridgeTabKey.Recurring,
      };

      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.RECURRING_BUY_CONTAINER),
        ).toBeOnTheScreen();
      });
      expect(mockSetParams).toHaveBeenCalledWith({
        initialTab: undefined,
      });
    });

    it('opens the Limit tab requested by the route', async () => {
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        initialTab: BridgeTabKey.Limit,
        initialLimitOrderExpirationMinutes: 10080,
        initialLimitOrderPriceTolerance: '0.5',
        swapViewTraceId: 'trace-1',
      };

      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });
      expect(mockSetParams).toHaveBeenCalledWith({
        initialTab: undefined,
      });
    });

    it('mounts the pager on the Limit tab requested by the route', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        initialTab: BridgeTabKey.Limit,
      };
      // The native pager only reads `initialPage` from its first render.
      const renderedInitialPages: (number | undefined)[] = [];
      const originalRender = PagerView.prototype.render;
      jest.spyOn(PagerView.prototype, 'render').mockImplementation(function (
        this: PagerView,
      ) {
        renderedInitialPages.push(this.props.initialPage);
        return originalRender.call(this);
      });

      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );
      mockRoute.params.initialTab = undefined;

      const [initialPage] = renderedInitialPages;
      expect(initialPage).toBe(1);

      // Android reports the page it mounted on once the pager is attached.
      await firePagerEvent(getByTestId, 'pageSelected', {
        position: initialPage,
      });
      await firePagerEvent(getByTestId, 'pageScrollStateChanged', {
        pageScrollState: 'dragging',
      });
      await settlePager(getByTestId);

      expect(
        getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
      ).toBeOnTheScreen();
    });

    it('applies the limit order deep link presets over the session values once per deep link', () => {
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        initialTab: BridgeTabKey.Limit,
        initialLimitOrderExpirationMinutes: 10080,
        initialLimitOrderPriceTolerance: '0.5',
      };

      const testState = merge({}, stateWithTabsEnabled(), {
        bridge: {
          limitOrderExpirationMinutes: 1440,
          limitOrderCostTolerance: '3',
        },
      }) as DeepPartial<RootState>;

      const { store } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(store.getState().bridge.limitOrderExpirationMinutes).toBe(10080);
      expect(store.getState().bridge.limitOrderCostTolerance).toBe('0.5');
      expect(mockSetParams).toHaveBeenCalledWith({
        initialLimitOrderExpirationMinutes: undefined,
        initialLimitOrderPriceTolerance: undefined,
      });
    });

    it('keeps the session limit order settings when the deep link omits presets', () => {
      mockRoute.params = {
        sourcePage: 'deeplink',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.MainView,
        initialTab: BridgeTabKey.Limit,
      };

      const testState = merge({}, stateWithTabsEnabled(), {
        bridge: {
          limitOrderExpirationMinutes: 10080,
          limitOrderCostTolerance: '3',
        },
      }) as DeepPartial<RootState>;

      const { store } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      expect(store.getState().bridge.limitOrderExpirationMinutes).toBe(10080);
      expect(store.getState().bridge.limitOrderCostTolerance).toBe('3');
    });

    it('keeps the limit order settings when switching tabs away and back', async () => {
      mockRoute.params = {
        sourcePage: 'test',
        initialTab: BridgeTabKey.Limit,
      } as BridgeRouteParams;

      const testState = merge({}, stateWithTabsEnabled(), {
        bridge: {
          limitOrderExpirationMinutes: 10080,
          limitOrderCostTolerance: '3',
        },
      }) as DeepPartial<RootState>;

      const { getByTestId, queryByTestId, store } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: testState },
      );

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });

      // The mocked setParams leaves params in place; the real one clears
      // initialTab once consumed. Mirror that before switching tabs.
      mockRoute.params.initialTab = undefined;

      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.MARKET_TAB));
      await settlePager(getByTestId);
      await waitFor(() => {
        expect(
          queryByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeNull();
      });
      expect(store.getState().bridge.limitOrderExpirationMinutes).toBe(10080);
      expect(store.getState().bridge.limitOrderCostTolerance).toBe('3');

      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.LIMIT_TAB));
      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });
      expect(store.getState().bridge.limitOrderExpirationMinutes).toBe(10080);
      expect(store.getState().bridge.limitOrderCostTolerance).toBe('3');
    });

    it('resets a reused Limit tab from History to Open orders', async () => {
      const rendered = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );
      fireEvent.press(rendered.getByTestId(BridgeViewSelectorsIDs.LIMIT_TAB));
      await waitFor(() => {
        expect(
          rendered.getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });
      fireEvent.press(rendered.getByTestId(OrdersTabsSelectorsIDs.HISTORY_TAB));
      expect(
        rendered.getByText(strings('bridge.orders.empty.history')),
      ).toBeOnTheScreen();

      mockRoute.params = {
        sourcePage: 'TokenDetails',
        bridgeViewMode: BridgeViewMode.Unified,
        location: MetaMetricsSwapsEventSource.TokenView,
        initialTab: BridgeTabKey.Limit,
      };
      rendered.rerender(<BridgeView />);

      await waitFor(() => {
        expect(
          rendered.getByText(strings('bridge.orders.empty.open_orders')),
        ).toBeOnTheScreen();
      });
      expect(
        rendered.queryByText(strings('bridge.orders.empty.history')),
      ).toBeNull();
    });

    it('shows the next tab once a left swipe settles on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      expect(
        queryByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
      ).toBeNull();

      await firePagerEvent(getByTestId, 'pageScrollStateChanged', {
        pageScrollState: 'dragging',
      });
      await firePagerEvent(getByTestId, 'pageSelected', { position: 1 });
      await settlePager(getByTestId);

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });
    });

    it('mounts the Limit page on a Limit tab press and keeps the Market quote state until the pager settles', async () => {
      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );
      const resetState = jest.mocked(
        Engine.context.BridgeController.resetState,
      );
      resetState.mockClear();

      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.LIMIT_TAB));

      expect(
        getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
      ).toBeOnTheScreen();
      expect(
        queryByTestId(
          `${BridgeViewSelectorsIDs.TAB_PAGE_SKELETON}-${BridgeTabKey.Limit}`,
        ),
      ).toBeNull();
      expect(
        getByTestId(BridgeViewSelectorsIDs.SOURCE_TOKEN_AREA),
      ).toBeOnTheScreen();
      expect(resetState).not.toHaveBeenCalled();

      await settlePager(getByTestId);

      await waitFor(() => {
        expect(resetState).toHaveBeenCalled();
      });
      expect(
        getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
      ).toBeOnTheScreen();
    });

    it('shows the previous tab once a right swipe settles', async () => {
      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.LIMIT_TAB));
      await settlePager(getByTestId);
      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });

      await firePagerEvent(getByTestId, 'pageScrollStateChanged', {
        pageScrollState: 'dragging',
      });
      await firePagerEvent(getByTestId, 'pageScroll', {
        position: 0,
        offset: 0.4,
      });
      await firePagerEvent(getByTestId, 'pageSelected', { position: 0 });
      await settlePager(getByTestId);

      await waitFor(() => {
        expect(
          queryByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeNull();
      });
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('keeps the pager scrollable on the Market tab and leaves right swipes to the native back gesture on iOS', async () => {
      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await swipe(80, 600);

      expect(
        getByTestId(BridgeViewSelectorsIDs.TABS_CONTENT).props.scrollEnabled,
      ).toBe(true);
      expect(
        getByTestId(BridgeViewSelectorsIDs.BACK_GESTURE_EDGE),
      ).toBeOnTheScreen();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('shows the Limit tab once a drag from the Market tab settles on iOS', async () => {
      const { getByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await firePagerEvent(getByTestId, 'pageScrollStateChanged', {
        pageScrollState: 'dragging',
      });
      await firePagerEvent(getByTestId, 'pageSelected', { position: 1 });
      await settlePager(getByTestId);

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.LIMIT_ORDER_CONTAINER),
        ).toBeOnTheScreen();
      });
    });

    it('shows the back gesture edge only once the pager settles on the Market tab on iOS', async () => {
      const { getByTestId, queryByTestId } = renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );
      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.LIMIT_TAB));
      await settlePager(getByTestId);

      expect(
        queryByTestId(BridgeViewSelectorsIDs.BACK_GESTURE_EDGE),
      ).toBeNull();

      fireEvent.press(getByTestId(BridgeViewSelectorsIDs.MARKET_TAB));

      expect(
        queryByTestId(BridgeViewSelectorsIDs.BACK_GESTURE_EDGE),
      ).toBeNull();

      await settlePager(getByTestId);

      await waitFor(() => {
        expect(
          getByTestId(BridgeViewSelectorsIDs.BACK_GESTURE_EDGE),
        ).toBeOnTheScreen();
      });
    });

    it('navigates back on a right swipe on the Market tab on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await swipe(80, 600);

      expect(mockGoBack).toHaveBeenCalled();
    });

    it('stays on the screen on a left swipe on the Market tab on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: stateWithTabsEnabled() },
      );

      await swipe(-80, -600);

      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('navigates back on a right swipe over the tab content when the tabs bar is hidden on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      renderScreen(
        BridgeView,
        { name: Routes.BRIDGE.ROOT },
        { state: mockState },
      );

      await swipe(80, 600);

      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});
