import '../../../../../../tests/component-view/mocks';
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import {
  AggregatedOrderBookConnection,
  type ChaseOrder,
  type OrderBookData,
  type OrderBookLevel,
  type PriceUpdate,
  type TriggerOrderType,
  type PerpsOrderCapabilities,
  type PerpsProviderType,
  type TwapOrder,
  type TwapOrderFill,
} from '@metamask/perps-controller';
import { Platform } from 'react-native';
import { renderPerpsProMarketView } from '../../../../../../tests/component-view/renderers/perpsViewRenderer';
import {
  createFundedAccountForViews,
  createEthMarketForViews,
} from '../../../../../../tests/component-view/fixtures/perpsViewFixtures';
import Engine from '../../../../../core/Engine';
import { updateBgState } from '../../../../../core/redux/slices/engine';
import { PerpsConnectionManager } from '../../services/PerpsConnectionManager';
import { PerpsCacheInvalidator } from '../../services/PerpsCacheInvalidator';
import { resetPerpsChaseOrdersStoreForTests } from '../../hooks/usePerpsChaseOrders';
import { resetChaseOrderVisibilityForTests } from '../../services/ChaseOrderVisibility';
import {
  PerpsOrderTypeBottomSheetSelectorsIDs,
  PerpsProOrderFormSelectorsIDs,
  PerpsProMarketViewSelectorsIDs,
} from '../../Perps.testIds';

export const ids = PerpsProOrderFormSelectorsIDs;
export const orderBookValueHeaderId = `${PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL}-column-header-value`;
export const TIMEOUT_MS = 5000;
export const activeChase: ChaseOrder = {
  handle: 'chase-view-1',
  symbol: 'ETH',
  side: 'buy',
  originalSize: '1',
  remainingSize: '1',
  arrivalPrice: '2500',
  restingPrice: '2500.1',
  restingOrderId: '55',
  distanceChasedBps: 1,
  maxDistanceBps: 5,
  repricings: 0,
  startedAt: 1,
  status: 'active',
};
export const activeTwap: TwapOrder = {
  orderId: 'twap-view-1',
  symbol: 'ETH',
  side: 'buy',
  size: '10',
  executedSize: '4',
  remainingSize: '6',
  executedNotional: '10000',
  averagePrice: '2500',
  fillProgressBps: 4000,
  timeProgressBps: 5000,
  elapsedTimeMilliseconds: 60_000,
  durationMinutes: 30,
  randomize: false,
  reduceOnly: false,
  status: 'active',
  startedAt: 1_000,
  lastUpdated: 2_000,
  fills: [],
  providerId: 'hyperliquid',
};
export const completeTwapFill: TwapOrderFill = {
  fillId: 'fill-view-1',
  orderId: activeTwap.orderId,
  side: 'buy',
  price: '2500',
  size: '1.5',
  fee: '0.5',
  feeToken: 'USDC',
  timestamp: 1_700_000_100_000,
  transactionHash: '0xabc',
};
export const completeTwap: TwapOrder = {
  ...activeTwap,
  providerId: 'lighter',
  randomize: true,
  reduceOnly: true,
  startedAt: 1_700_000_000_000,
  fills: [completeTwapFill],
};
export const triggeredOrderTypeIDs = [
  PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
  PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
  PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_LIMIT_OPTION,
  PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_MARKET_OPTION,
] as const;

let connectionReadySpy: jest.SpyInstance;
let connectionSubscriptionSpy: jest.SpyInstance;
let dateNowSpy: jest.SpyInstance | undefined;
export const issuedTwapReadPromises = new Set<Promise<TwapOrder[]>>();
export const activeTwapSubscriptions = new Set<symbol>();
export const settledChaseReadPromises = new Set<Promise<ChaseOrder[]>>();
export type TwapSubscriptionCallback = Parameters<
  typeof Engine.context.PerpsController.subscribeToTwapOrders
>[0]['callback'];

export const trackTwapRead = (
  promise: Promise<TwapOrder[]>,
): Promise<TwapOrder[]> => {
  issuedTwapReadPromises.add(promise);
  return promise;
};

export const mockTwapOrders = (orders: TwapOrder[]) => {
  jest
    .mocked(Engine.context.PerpsController.getTwapOrders)
    .mockImplementation(() => trackTwapRead(Promise.resolve(orders)));
};

export const mockNextTwapOrdersFailure = (error: Error) => {
  jest
    .mocked(Engine.context.PerpsController.getTwapOrders)
    .mockImplementationOnce(() => trackTwapRead(Promise.reject(error)));
};

export const mockTwapOrderSubscription = (
  onSubscribe?: (callback: TwapSubscriptionCallback) => void,
) => {
  jest
    .mocked(Engine.context.PerpsController.subscribeToTwapOrders)
    .mockImplementation(({ callback }) => {
      const subscription = Symbol('twap-subscription');
      activeTwapSubscriptions.add(subscription);
      onSubscribe?.(callback);

      return () => {
        activeTwapSubscriptions.delete(subscription);
      };
    });
};

export const settleIssuedTwapReads = async () => {
  while (issuedTwapReadPromises.size > 0) {
    const issuedReads = [...issuedTwapReadPromises];
    issuedReads.forEach((promise) => issuedTwapReadPromises.delete(promise));
    await act(async () => {
      await Promise.allSettled(issuedReads);
    });
  }
};

export const settleIssuedChaseReads = async () => {
  while (true) {
    const issuedReads = jest
      .mocked(Engine.context.PerpsController.getChaseOrders)
      .mock.results.map((result) => result.value as Promise<ChaseOrder[]>)
      .filter(
        (promise): promise is Promise<ChaseOrder[]> =>
          Boolean(promise?.then) && !settledChaseReadPromises.has(promise),
      );
    if (issuedReads.length === 0) {
      return;
    }
    issuedReads.forEach((promise) => settledChaseReadPromises.add(promise));
    await act(async () => {
      await Promise.allSettled(issuedReads);
    });
  }
};

export const openChaseManagementTab = async () => {
  await screen.findByTestId(
    PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_CHASE,
  );
  // Rollout-off discovery updates the shared Chase store and replaces the tab
  // node. Drain that read and reacquire the live node before pressing it.
  await settleIssuedChaseReads();
  fireEvent.press(
    screen.getByTestId(
      PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_CHASE,
    ),
  );
  await screen.findByTestId(
    PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE,
  );
  await settleIssuedChaseReads();
};

export const openTwapManagementTab = async () => {
  await screen.findByTestId(
    PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_TWAP,
  );
  // Drain the issued read and reacquire the current tab node so the press
  // cannot target an instance replaced by a re-render.
  await settleIssuedTwapReads();
  fireEvent.press(
    screen.getByTestId(PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_TWAP),
  );
  await screen.findByTestId(
    PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE,
  );
  await settleIssuedTwapReads();
};

export const resetPerpsControllerMocks = () => {
  jest
    .mocked(Engine.context.PerpsController.getScalePriceLadder)
    .mockReset()
    .mockResolvedValue({ status: 'unavailable', reason: 'not_implemented' });
  jest
    .mocked(Engine.context.PerpsController.getOrderCapabilities)
    .mockReset()
    .mockResolvedValue({
      status: 'unavailable',
      providerId: 'hyperliquid',
      reason: 'strategy_market_unsupported',
    });
  jest
    .mocked(Engine.context.PerpsController.getChaseOrders)
    .mockReset()
    .mockResolvedValue([]);
  jest.mocked(Engine.context.PerpsController.getTwapOrders).mockReset();
  mockTwapOrders([]);
  jest.mocked(Engine.context.PerpsController.subscribeToTwapOrders).mockReset();
  mockTwapOrderSubscription();
  jest
    .mocked(Engine.context.PerpsController.cancelOrder)
    .mockReset()
    .mockResolvedValue({ success: true });
  jest
    .mocked(Engine.context.PerpsController.getOrders)
    .mockReset()
    .mockResolvedValue([]);
  jest
    .mocked(Engine.context.PerpsController.placeOrder)
    .mockReset()
    .mockResolvedValue({
      success: true,
      orderId: 'component-view-order',
    });
  jest
    .mocked(Engine.context.PerpsController.validateOrder)
    .mockReset()
    .mockResolvedValue({ isValid: true });
};

export const engineWithState = Engine as unknown as {
  state?: Record<string, unknown>;
};
let engineStateBeforeTest: Record<string, unknown> | undefined;

export function registerPerpsProMarketViewHooks() {
  beforeEach(() => {
    // Identity journeys publish controller updates through Engine.state. Snapshot
    // it so a later preference write cannot reuse that copy and collapse the book.
    engineStateBeforeTest = engineWithState.state;
    issuedTwapReadPromises.clear();
    activeTwapSubscriptions.clear();
    settledChaseReadPromises.clear();
    resetPerpsChaseOrdersStoreForTests();
    resetChaseOrderVisibilityForTests();
    PerpsCacheInvalidator._clearAllSubscribers();
    resetPerpsControllerMocks();
    jest
      .mocked(Engine.context.PerpsController.subscribeToOrderBook)
      .mockReset();
    jest
      .mocked(Engine.context.PerpsController.subscribeToOrderBook)
      .mockImplementation(() => () => undefined);
    connectionReadySpy = jest
      .spyOn(PerpsConnectionManager, 'isSelectedUserContextReady')
      .mockReturnValue(true);
    connectionSubscriptionSpy = jest
      .spyOn(PerpsConnectionManager, 'subscribeToInitializedUserContext')
      .mockImplementation(() => () => undefined);
  });

  afterEach(async () => {
    try {
      // This is deliberately universal rather than scoped to the platform
      // describe: every render mounts TWAP discovery, including header-only
      // journeys. Unmount first to clear real intervals and subscriptions, then
      // drain every controller read (including reads issued by a prior read's
      // React continuation).
      cleanup();
      // React Native Testing Library cannot safely overlap async act scopes.
      // Settle the independent discovery pipelines serially so teardown cannot
      // unmount the next test's renderer through a corrupted shared act stack.
      await settleIssuedTwapReads();
      await settleIssuedChaseReads();

      // Failure-sensitive isolation guards: a leaking discovery read or
      // subscription is attributed to the journey that created it instead of
      // timing out an unrelated test later in the file.
      expect(issuedTwapReadPromises.size).toBe(0);
      expect(activeTwapSubscriptions.size).toBe(0);
      expect(
        jest
          .mocked(Engine.context.PerpsController.getChaseOrders)
          .mock.results.filter(
            (result) =>
              Boolean((result.value as Promise<ChaseOrder[]>)?.then) &&
              !settledChaseReadPromises.has(
                result.value as Promise<ChaseOrder[]>,
              ),
          ),
      ).toHaveLength(0);
      expect(PerpsCacheInvalidator.getSubscriberCount('positions')).toBe(0);
      expect(PerpsCacheInvalidator.getSubscriberCount('accountState')).toBe(0);
      expect(PerpsCacheInvalidator.getSubscriberCount('markets')).toBe(0);
    } finally {
      issuedTwapReadPromises.clear();
      activeTwapSubscriptions.clear();
      settledChaseReadPromises.clear();
      PerpsCacheInvalidator._clearAllSubscribers();
      connectionReadySpy.mockRestore();
      connectionSubscriptionSpy.mockRestore();
      resetPerpsChaseOrdersStoreForTests();
      resetChaseOrderVisibilityForTests();
      // The TWAP elapsed journey pins Date.now; restore it here so a failed
      // assertion cannot leak a frozen clock into the next test.
      dateNowSpy?.mockRestore();
      dateNowSpy = undefined;
      engineWithState.state = engineStateBeforeTest;
    }
  });
}

export const renderFundedProMarket = () =>
  renderPerpsProMarketView({
    streamOverrides: {
      account: createFundedAccountForViews('1000'),
    },
  });

export const renderProMarketWithTriggeredOrdersFlag = (
  enabled: boolean,
  providerId: 'hyperliquid' | 'lighter' = 'hyperliquid',
  capabilities?: PerpsOrderCapabilities | Promise<PerpsOrderCapabilities>,
  restoredOrderType?: TriggerOrderType,
) => {
  jest
    .mocked(Engine.context.PerpsController.getOrderCapabilities)
    .mockResolvedValue(
      capabilities ??
        (providerId === 'hyperliquid'
          ? {
              status: 'ready',
              providerId,
              supportedStrategies: [],
              supportedTriggerOrderTypes: [
                'stop_market',
                'stop_limit',
                'take_profit_market',
                'take_profit_limit',
              ],
            }
          : { status: 'unavailable', providerId, reason: 'not_implemented' }),
    );

  return renderPerpsProMarketView({
    initialParams: { market: { symbol: 'ETH', providerId } },
    streamOverrides: {
      account: createFundedAccountForViews('1000'),
    },
    overrides: {
      engine: {
        backgroundState: {
          PerpsController: {
            activeProvider: providerId,
            ...(restoredOrderType && { selectedOrderType: restoredOrderType }),
          },
          RemoteFeatureFlagController: {
            remoteFeatureFlags: {
              perpsProModeEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
              perpsProTriggeredOrdersEnabled: {
                enabled,
                minimumVersion: '0.0.0',
              },
              perpsMobileTwap: {
                enabled: false,
                minimumVersion: '0.0.0',
              },
              perpsMobileChase: {
                enabled: false,
                minimumVersion: '0.0.0',
              },
            },
          },
        },
      },
    },
  });
};

export const renderProMarketWithTwapFlag = (
  enabled: boolean,
  activeProvider: 'hyperliquid' | 'lighter' = 'hyperliquid',
) => {
  jest
    .mocked(Engine.context.PerpsController.getOrderCapabilities)
    .mockResolvedValue(
      activeProvider === 'hyperliquid'
        ? {
            status: 'ready',
            providerId: 'hyperliquid',
            supportedStrategies: ['twap'],
          }
        : {
            status: 'unavailable',
            providerId: 'lighter',
            reason: 'strategy_market_unsupported',
          },
    );

  return renderPerpsProMarketView({
    streamOverrides: {
      account: createFundedAccountForViews('1000'),
    },
    overrides: {
      engine: {
        backgroundState: {
          PerpsController: {
            activeProvider,
          },
          RemoteFeatureFlagController: {
            remoteFeatureFlags: {
              perpsProModeEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
              perpsMobileTwap: {
                enabled,
                minimumVersion: '0.0.0',
              },
              perpsProTriggeredOrdersEnabled: {
                enabled: false,
                minimumVersion: '0.0.0',
              },
            },
          },
        },
      },
    },
  });
};

export const renderProMarketWithScaleFlag = (
  enabled: boolean,
  providerId: PerpsProviderType = 'hyperliquid',
) => {
  const market =
    providerId === 'lighter'
      ? createEthMarketForViews({ providerId })
      : undefined;
  jest
    .mocked(Engine.context.PerpsController.getOrderCapabilities)
    .mockResolvedValue({
      status: 'ready',
      providerId,
      supportedStrategies: enabled ? ['scale'] : [],
      supportedTriggerOrderTypes: [
        'stop_market',
        'stop_limit',
        'take_profit_market',
        'take_profit_limit',
      ],
    });

  return renderPerpsProMarketView({
    initialParams: market ? { market } : undefined,
    streamOverrides: {
      ...(market ? { marketData: [market] } : {}),
      account: createFundedAccountForViews('1000'),
    },
    overrides: {
      engine: {
        backgroundState: {
          PerpsController: {
            activeProvider: providerId,
          },
          RemoteFeatureFlagController: {
            remoteFeatureFlags: {
              perpsProModeEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
              perpsProTriggeredOrdersEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
              perpsMobileScale: {
                enabled,
                minimumVersion: '0.0.0',
              },
            },
          },
        },
      },
    },
  });
};

export const findSizeInput = () =>
  screen.findByTestId(ids.SIZE_INPUT, {}, { timeout: TIMEOUT_MS });

export const findPriceInput = (testID: string) =>
  screen.findByTestId(
    testID,
    { includeHiddenElements: true },
    { timeout: TIMEOUT_MS },
  );

export const openTwapOrderForm = async () => {
  const sizeInput = await findSizeInput();
  fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
  await screen.findByTestId(
    PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
    {},
    { timeout: TIMEOUT_MS },
  );
  fireEvent.press(
    screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
  );
  await screen.findByTestId(
    PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION,
    {},
    { timeout: TIMEOUT_MS },
  );
  fireEvent.press(
    screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
  );

  return {
    sizeInput,
    section: await screen.findByTestId(ids.TWAP_DURATION_SECTION),
    durationButton: screen.getByTestId(ids.TWAP_DURATION_BUTTON),
    durationValue: screen.getByTestId(ids.TWAP_DURATION_VALUE),
    randomize: screen.getByTestId(ids.TWAP_RANDOMIZE),
  };
};

export const openScaleOrderForm = async () => {
  const sizeInput = await findSizeInput();
  fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
  const advancedTab = await screen.findByTestId(
    PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
    {},
    { timeout: TIMEOUT_MS },
  );
  fireEvent.press(advancedTab);
  const scaleOption = await screen.findByTestId(
    PerpsOrderTypeBottomSheetSelectorsIDs.SCALE_OPTION,
    {},
    { timeout: TIMEOUT_MS },
  );
  fireEvent.press(scaleOption);

  return sizeInput;
};

export const openTwapDurationSheet = async () => {
  fireEvent.press(screen.getByTestId(ids.TWAP_DURATION_BUTTON));
  await screen.findByTestId(
    ids.TWAP_DURATION_SHEET,
    {},
    { timeout: TIMEOUT_MS },
  );

  return screen.getByTestId(ids.TWAP_DURATION_PICKER);
};

export const createTwapPickerDate = (hours: number, minutes: number) => {
  if (Platform.OS === 'ios') {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    date.setMinutes(hours * 60 + minutes);
    return date;
  }
  const date = new Date(0);
  date.setUTCHours(hours, minutes);
  return date;
};

export const deliverProOrderBook = (bidPrice: string) => {
  const level = (price: string): OrderBookLevel => ({
    price,
    size: '1.5',
    total: '1.5',
    notional: '3750',
    totalNotional: '3750',
  });
  const book: OrderBookData = {
    bids: [level(bidPrice)],
    asks: [],
    spread: '10',
    spreadPercentage: '0.4',
    midPrice: '2500',
    lastUpdated: 1_700_000_000_000,
    maxTotal: '1.5',
  };
  jest
    .mocked(Engine.context.PerpsController.subscribeToOrderBook)
    .mockImplementation(({ callback }) => {
      callback(book);
      return () => undefined;
    });
  return jest
    .spyOn(AggregatedOrderBookConnection.prototype, 'subscribe')
    .mockImplementation((params) => {
      params.callback(book);
      return () => undefined;
    });
};

export const pressTopBid = () =>
  screen.findByTestId(
    `${PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL}-bid-row-0`,
    {},
    { timeout: TIMEOUT_MS },
  );

export const renderChaseProMarket = () => {
  jest
    .mocked(Engine.context.PerpsController.getOrderCapabilities)
    .mockResolvedValue({
      status: 'ready',
      providerId: 'hyperliquid',
      supportedStrategies: ['chase'],
      supportedTriggerOrderTypes: [
        'stop_market',
        'stop_limit',
        'take_profit_market',
        'take_profit_limit',
      ],
    });
  return renderPerpsProMarketView({
    streamOverrides: { account: createFundedAccountForViews('1000') },
    overrides: {
      engine: {
        backgroundState: {
          RemoteFeatureFlagController: {
            remoteFeatureFlags: {
              perpsProModeEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
              perpsMobileChase: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
            },
          },
        },
      },
    },
  });
};

export const openChaseOrderForm = async () => {
  await findSizeInput();
  fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
  fireEvent.press(
    await screen.findByTestId(
      PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
      {},
      { timeout: TIMEOUT_MS },
    ),
  );
  fireEvent.press(
    await screen.findByTestId(
      PerpsOrderTypeBottomSheetSelectorsIDs.CHASE_OPTION,
      {},
      { timeout: TIMEOUT_MS },
    ),
  );
  await screen.findByTestId(ids.CHASE_FORM, {}, { timeout: TIMEOUT_MS });
};

export const selectTriggeredOrderType = async (
  optionTestID: (typeof triggeredOrderTypeIDs)[number],
) => {
  fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
  fireEvent.press(
    await screen.findByTestId(
      PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
      {},
      { timeout: TIMEOUT_MS },
    ),
  );
  fireEvent.press(
    await screen.findByTestId(optionTestID, {}, { timeout: TIMEOUT_MS }),
  );
};

export const emitEthPrice = (
  stream: { emitPrices: (prices: Record<string, PriceUpdate>) => void },
  price = '2501',
) => {
  act(() => {
    stream.emitPrices({
      ETH: {
        symbol: 'ETH',
        price,
        markPrice: price,
        percentChange24h: '2',
        timestamp: Date.now(),
        isTradable: true,
      },
    });
  });
};

export const syncEngineControllerState = (
  store: ReturnType<typeof renderPerpsProMarketView>['store'],
  key:
    | 'AccountsController'
    | 'AccountTreeController'
    | 'PerpsController'
    | 'RemoteFeatureFlagController',
  nextState: Record<string, unknown>,
) => {
  engineWithState.state = {
    ...(engineWithState.state ?? {}),
    [key]: nextState,
  };
  store.dispatch(updateBgState({ key }));
};

export const showOrderBook = (
  store: ReturnType<typeof renderPerpsProMarketView>['store'],
) => {
  const current = store.getState().engine.backgroundState.PerpsController;
  act(() => {
    syncEngineControllerState(store, 'PerpsController', {
      ...current,
      proLayoutPreferences: {
        ...current?.proLayoutPreferences,
        orderBookExpanded: true,
      },
    });
  });
};

export const setDateNowSpy = (value: typeof dateNowSpy) => {
  dateNowSpy = value;
};
