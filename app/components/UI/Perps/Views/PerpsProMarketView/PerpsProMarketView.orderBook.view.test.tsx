import {
  TIMEOUT_MS,
  findPriceInput,
  findSizeInput,
  ids,
  openChaseOrderForm,
  openScaleOrderForm,
  openTwapOrderForm,
  registerPerpsProMarketViewHooks,
  renderChaseProMarket,
  renderFundedProMarket,
  renderProMarketWithScaleFlag,
  renderProMarketWithTriggeredOrdersFlag,
  renderProMarketWithTwapFlag,
  selectTriggeredOrderType,
  syncEngineControllerState,
} from './PerpsProMarketView.viewTestUtils';
import '../../../../../../tests/component-view/mocks';
import {
  act,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react-native';
import {
  AggregatedOrderBookConnection,
  type OrderBookData,
  type OrderBookLevel,
  PERPS_EVENT_PROPERTY,
} from '@metamask/perps-controller';
import type { ComponentType } from 'react';
import { renderPerpsProMarketView } from '../../../../../../tests/component-view/renderers/perpsViewRenderer';
import { wirePerpsControllerForStore } from '../../../../../../tests/component-view/helpers/perpsViewTestHelpers';
import {
  createBtcMarketForViews,
  createCrossMarginAccountForViews,
  createFundedAccountForViews,
  createEthMarketForViews,
  createLongPositionForViews,
} from '../../../../../../tests/component-view/fixtures/perpsViewFixtures';
import { strings } from '../../../../../../locales/i18n';
import Engine from '../../../../../core/Engine';
import Routes from '../../../../../constants/navigation/Routes';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import { analytics } from '../../../../../util/analytics/analytics';
import { FEE_DISPLAY_AB_TEST_KEY } from '../../abTestConfig';
import {
  PerpsBalanceBottomSheetSelectorsIDs,
  PerpsModeToggleSelectorsIDs,
  PerpsOrderTypeBottomSheetSelectorsIDs,
  PerpsProMarketViewSelectorsIDs,
  PerpsTPSLViewSelectorsIDs,
} from '../../Perps.testIds';
import { formatPerpsInput } from '../../utils/formatUtils';
import PerpsTPSLView from '../PerpsTPSLView/PerpsTPSLView';

registerPerpsProMarketViewHooks();

describe('PerpsProMarketView header actions', () => {
  it('shows Pro header actions including wallet, watchlist, and mode toggle', async () => {
    renderPerpsProMarketView();

    expect(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.HEADER_BACK_BUTTON,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId(
        PerpsProMarketViewSelectorsIDs.HEADER_MARKET_LIST_BUTTON,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId(PerpsProMarketViewSelectorsIDs.HEADER_FAVORITE_BUTTON),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId(PerpsModeToggleSelectorsIDs.PRO_SEGMENT),
    ).toBeOnTheScreen();

    fireEvent.press(
      screen.getByTestId(PerpsProMarketViewSelectorsIDs.HEADER_WALLET_BUTTON),
    );

    expect(
      await screen.findByTestId(PerpsBalanceBottomSheetSelectorsIDs.CONTAINER),
    ).toBeOnTheScreen();
  });

  it('badges the wallet button from a critical cross margin ratio and opens the balance sheet', async () => {
    renderPerpsProMarketView({
      crossMarginEnabled: true,
      streamOverrides: {
        account: createCrossMarginAccountForViews({
          maintenanceMargin: '800',
          marginUsed: '800',
          notional: '2000',
        }),
      },
    });

    const walletButton = await screen.findByTestId(
      PerpsProMarketViewSelectorsIDs.HEADER_WALLET_BUTTON,
    );

    expect(walletButton).toHaveProp(
      'accessibilityLabel',
      `${strings('perps.market_details.wallet')}, ${strings(
        'perps.crossMarginSummary.account_ratio',
      )}`,
    );
    expect(
      screen.getByTestId(
        `${PerpsProMarketViewSelectorsIDs.HEADER_WALLET_BUTTON}-risk-badge`,
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();

    fireEvent.press(walletButton);

    expect(
      await screen.findByTestId(PerpsBalanceBottomSheetSelectorsIDs.CONTAINER),
    ).toBeOnTheScreen();
  });
});

describe('Pro market order liquidity', () => {
  it.each([true, false])(
    'checks the exact fractional MAX close with shallow=%s and recovers when depth returns',
    async (shallow) => {
      const getMarkets = jest.mocked(Engine.context.PerpsController.getMarkets);
      const originalImplementation = getMarkets.getMockImplementation();
      getMarkets.mockResolvedValue([
        { name: 'ETH', szDecimals: 3, maxLeverage: 50, marginTableId: 1 },
      ]);
      try {
        const level = (price: number, size: number): OrderBookLevel => ({
          price: String(price),
          size: String(size),
          total: String(size),
          notional: String(price * size),
          totalNotional: String(price * size),
        });
        const makeBook = (bids: OrderBookLevel[]): OrderBookData => ({
          midPrice: '100',
          asks: [],
          bids,
          spread: '0',
          spreadPercentage: '0',
          lastUpdated: Date.now(),
          maxTotal: '1',
        });
        const blockedBook = makeBook(
          shallow ? [level(100, 0.5)] : [level(100, 0.5), level(96, 0.009)],
        );
        let deliver: ((book: OrderBookData) => void) | undefined;
        jest
          .mocked(Engine.context.PerpsController.subscribeToOrderBook)
          .mockImplementation(({ callback }) => {
            deliver = callback;
            callback(blockedBook);
            return () => undefined;
          });
        const market = {
          ...createEthMarketForViews({ price: '$100.00' }),
          providerId: 'hyperliquid' as const,
          szDecimals: 3,
        };
        const placeOrder = jest.mocked(
          Engine.context.PerpsController.placeOrder,
        );
        renderPerpsProMarketView({
          initialParams: { market },
          streamOverrides: {
            account: createFundedAccountForViews('1000'),
            marketData: [market],
            positions: [
              createLongPositionForViews({
                size: '0.509',
                entryPrice: '100',
                positionValue: '50.9',
                marginUsed: '10',
                liquidationPrice: '50',
              }),
            ],
            orders: [],
            prices: {
              ETH: {
                symbol: 'ETH',
                price: '100',
                markPrice: '100',
                percentChange24h: '0',
                timestamp: Date.now(),
                isTradable: true,
              },
            },
          },
        });
        await findSizeInput();
        fireEvent.press(screen.getByTestId(ids.DIRECTION_SHORT));
        fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));
        await waitFor(() =>
          expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen(),
        );
        fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 100);
        fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 100);

        const message = strings(
          shallow
            ? 'perps.slippage.insufficient_depth'
            : 'perps.slippage.cannot_fill',
        );
        expect(await screen.findByText(message)).toBeOnTheScreen();
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', '50');
        const submit = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
        expect(submit).toBeDisabled();
        fireEvent.press(submit);
        expect(placeOrder).not.toHaveBeenCalled();

        await act(async () => {
          deliver?.(makeBook([level(100, 0.509)]));
        });
        await waitFor(() =>
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled(),
        );
        expect(screen.queryByText(message)).not.toBeOnTheScreen();
        await act(async () => {
          fireEvent.press(screen.getByTestId(ids.PLACE_ORDER_BUTTON));
        });
        await waitFor(() =>
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              size: '0.509',
              reduceOnly: true,
              isBuy: false,
              isFullClose: true,
            }),
          ),
        );
        expect(placeOrder.mock.calls[0][0]).not.toHaveProperty('usdAmount');
      } finally {
        if (originalImplementation) {
          getMarkets.mockImplementation(originalImplementation);
        }
      }
    },
  );

  it.each([true, false, null])(
    'blocks shallow=%s and submits after visible depth recovers',
    async (shallow) => {
      const level = (price: number, size: number): OrderBookLevel => ({
        price: String(price),
        size: String(size),
        total: String(size),
        notional: String(price * size),
        totalNotional: String(price * size),
      });
      const makeBook = (asks: OrderBookLevel[]): OrderBookData => ({
        midPrice: '2500',
        asks,
        bids: [],
        spread: '0',
        spreadPercentage: '0',
        lastUpdated: Date.now(),
        maxTotal: '1',
      });
      const blockedBook = makeBook(
        shallow ? [level(2500, 0.001)] : [level(2500, 0.039), level(2600, 1)],
      );
      let deliver: ((book: OrderBookData) => void) | undefined;
      jest
        .mocked(Engine.context.PerpsController.subscribeToOrderBook)
        .mockImplementation(({ callback, onError }) => {
          deliver = callback;
          if (shallow === null) {
            onError?.(new Error('order book unavailable'));
          } else {
            callback(blockedBook);
          }
          return () => undefined;
        });
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      renderFundedProMarket();
      const input = await findSizeInput();

      fireEvent.changeText(input, '100');
      const message = strings(
        shallow !== false
          ? 'perps.slippage.insufficient_depth'
          : 'perps.slippage.cannot_fill',
      );
      expect(
        await screen.findByText(message, {}, { timeout: TIMEOUT_MS }),
      ).toBeOnTheScreen();
      const submit = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      expect(submit).toBeDisabled();
      fireEvent.press(submit);
      expect(placeOrder).not.toHaveBeenCalled();

      await act(async () => {
        deliver?.(makeBook([level(2500, 1)]));
      });
      await waitFor(
        () =>
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).not.toBeDisabled(),
        { timeout: TIMEOUT_MS },
      );
      expect(screen.queryByText(message)).not.toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByTestId(ids.PLACE_ORDER_BUTTON));
      });
      await waitFor(
        () =>
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              isBuy: true,
              orderType: 'market',
              usdAmount: '100',
            }),
          ),
        { timeout: TIMEOUT_MS },
      );
    },
  );

  it('keeps a limit order unblocked when the order book is unavailable', async () => {
    jest
      .mocked(Engine.context.PerpsController.subscribeToOrderBook)
      .mockImplementation(({ onError }) => {
        onError?.(new Error('order book unavailable'));
        return () => undefined;
      });
    const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
    renderFundedProMarket();
    fireEvent.changeText(await findSizeInput(), '100');
    const message = strings('perps.slippage.insufficient_depth');
    expect(
      await screen.findByText(message, {}, { timeout: TIMEOUT_MS }),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
    fireEvent.press(
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    fireEvent.changeText(limitInput, '2500');
    fireEvent(limitInput, 'blur');

    await waitFor(
      () =>
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).not.toBeDisabled(),
      { timeout: TIMEOUT_MS },
    );
    expect(screen.queryByText(message)).not.toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId(ids.PLACE_ORDER_BUTTON));
    });
    await waitFor(
      () =>
        expect(placeOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: 'ETH',
            orderType: 'limit',
            price: '2500',
          }),
        ),
      { timeout: TIMEOUT_MS },
    );
  });

  it('keeps a market order enabled while the order book subscription is pending', async () => {
    renderFundedProMarket();
    fireEvent.changeText(await findSizeInput(), '100');

    await waitFor(
      () =>
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).not.toBeDisabled(),
      { timeout: TIMEOUT_MS },
    );
    expect(
      Engine.context.PerpsController.subscribeToOrderBook,
    ).toHaveBeenCalled();
    expect(
      screen.queryByText(strings('perps.slippage.insufficient_depth')),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByText(strings('perps.slippage.cannot_fill')),
    ).not.toBeOnTheScreen();
  });
});

describe('Pro order book size on click', () => {
  const panelId = PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL;
  const bidRowId = `${panelId}-bid-row-0`;
  const settingsApplyId = `${panelId}-config-sheet-apply`;
  const ladderLevel = (price: string, size: string): OrderBookLevel => ({
    price,
    size,
    total: size,
    notional: String(Number(price) * Number(size)),
    totalNotional: String(Number(price) * Number(size)),
  });
  let ladderSpy: jest.SpyInstance | undefined;
  let unwireController: (() => void) | undefined;

  // The ladder streams on its own Hyperliquid socket, not the Engine. Serving
  // it at that socket wrapper is the transport boundary, like nock for HTTP.
  const serveLadder = (bid: OrderBookLevel, midPrice = '2500') => {
    ladderSpy = jest
      .spyOn(AggregatedOrderBookConnection.prototype, 'subscribe')
      .mockImplementation(({ callback, onStatusChange }) => {
        onStatusChange?.('connected');
        callback({
          bids: [bid],
          asks: [],
          midPrice,
          spread: '0',
          spreadPercentage: '0',
          lastUpdated: Date.now(),
          maxTotal: bid.size,
        });
        return () => undefined;
      });
  };

  const renderProBook = (currency: 'usd' | 'base' = 'usd') =>
    renderPerpsProMarketView({
      streamOverrides: { account: createFundedAccountForViews('1000') },
      overrides: {
        engine: {
          backgroundState: {
            PerpsController: {
              orderBookPreferences: { currency, metric: 'size' },
              proLayoutPreferences: { orderBookExpanded: true },
            },
          },
        },
      },
    });

  const turnOnSizeOnClick = async () => {
    fireEvent.press(
      await screen.findByTestId(
        `${panelId}-grouping-trigger`,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    fireEvent(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_SIZE_ON_CLICK_SWITCH,
        {},
        { timeout: TIMEOUT_MS },
      ),
      'valueChange',
      true,
    );
    fireEvent.press(screen.getByTestId(settingsApplyId));
    await waitFor(() =>
      expect(screen.queryByTestId(settingsApplyId)).not.toBeOnTheScreen(),
    );
  };

  const tapBid = async () =>
    fireEvent.press(
      await screen.findByTestId(bidRowId, {}, { timeout: TIMEOUT_MS }),
    );

  const placeAndReadOrder = async () => {
    const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
    await waitFor(
      () => expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled(),
      { timeout: TIMEOUT_MS },
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId(ids.PLACE_ORDER_BUTTON));
    });
    await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(1), {
      timeout: TIMEOUT_MS,
    });
    return placeOrder.mock.calls[0][0];
  };

  afterEach(() => {
    ladderSpy?.mockRestore();
    ladderSpy = undefined;
    unwireController?.();
    unwireController = undefined;
  });

  it('fills only the price while size on click is off', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    const sizeBefore = (await findSizeInput()).props.value;

    await tapBid();

    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    await waitFor(() =>
      expect(limitInput).toHaveProp('value', formatPerpsInput('2490')),
    );
    expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', sizeBefore);
  });

  it('fills the row price and size and places exactly the row size', async () => {
    // $722.10 at 2,490 would size 0.30 ETH through the USD amount alone.
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    await findSizeInput();
    await turnOnSizeOnClick();

    await tapBid();

    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        formatPerpsInput('722.1'),
      ),
    );
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({
        orderType: 'limit',
        price: '2490',
        size: '0.29',
      }),
    );
    // Providers re-derive the size from a USD amount, so none is sent.
    expect(order).not.toHaveProperty('usdAmount');
  });

  it('shows the row size in coin and places it', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook('base');
    await findSizeInput();
    await turnOnSizeOnClick();

    await tapBid();

    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', '0.29'),
    );
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({ price: '2490', size: '0.29' }),
    );
    expect(order).not.toHaveProperty('usdAmount');
  });

  it('fills the trigger price and size of a stop-market order', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    const { store } = renderProMarketWithTriggeredOrdersFlag(true);
    unwireController = wirePerpsControllerForStore(store);
    await findSizeInput();
    fireEvent.press(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_EXPAND_BUTTON,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    await turnOnSizeOnClick();
    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
    );

    await tapBid();

    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    await waitFor(() =>
      expect(triggerInput).toHaveProp('value', formatPerpsInput('2490')),
    );
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({
        orderType: 'stop_market',
        triggerPrice: '2490',
        size: '0.29',
      }),
    );
    expect(order).not.toHaveProperty('usdAmount');
  });

  it('fills the limit price and size of a stop-limit order', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    const { store } = renderProMarketWithTriggeredOrdersFlag(true);
    unwireController = wirePerpsControllerForStore(store);
    await findSizeInput();
    fireEvent.press(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_EXPAND_BUTTON,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    await turnOnSizeOnClick();
    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
    );

    await tapBid();
    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    fireEvent.changeText(triggerInput, '2600');
    fireEvent(triggerInput, 'blur');

    expect(await findPriceInput(ids.LIMIT_PRICE_INPUT)).toHaveProp(
      'value',
      formatPerpsInput('2490'),
    );
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({
        orderType: 'stop_limit',
        price: '2490',
        triggerPrice: '2600',
        size: '0.29',
      }),
    );
    expect(order).not.toHaveProperty('usdAmount');
  });

  // A sell stop-limit at 2,400 with its trigger focused takes the 2,490 tap.
  const tapIntoFocusedStopLimitTrigger = async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    const { store } = renderProMarketWithTriggeredOrdersFlag(true);
    unwireController = wirePerpsControllerForStore(store);
    await findSizeInput();
    fireEvent.press(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_EXPAND_BUTTON,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    await turnOnSizeOnClick();
    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
    );
    fireEvent.press(screen.getByTestId(ids.DIRECTION_SHORT));
    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    fireEvent.changeText(limitInput, '2400');
    fireEvent(limitInput, 'blur');
    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    fireEvent(triggerInput, 'focus');

    await tapBid();

    await waitFor(() =>
      expect(triggerInput).toHaveProp('value', formatPerpsInput('2490')),
    );
    expect(limitInput).toHaveProp('value', formatPerpsInput('2400'));
    return triggerInput;
  };

  it('keeps the row size when the tap fills a focused stop-limit trigger', async () => {
    await tapIntoFocusedStopLimitTrigger();

    // $722.10 at the 2,400 limit would size 0.31 ETH through the amount alone.
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({
        orderType: 'stop_limit',
        isBuy: false,
        price: '2400',
        triggerPrice: '2490',
        size: '0.29',
      }),
    );
    expect(order).not.toHaveProperty('usdAmount');
  });

  it('sizes from the amount again once the filled trigger changes', async () => {
    const triggerInput = await tapIntoFocusedStopLimitTrigger();

    fireEvent.changeText(triggerInput, '2480');
    fireEvent(triggerInput, 'blur');

    expect(await placeAndReadOrder()).toEqual(
      expect.objectContaining({
        price: '2400',
        triggerPrice: '2480',
        size: '0.31',
        usdAmount: '722.1',
      }),
    );
  });

  it('keeps the row size when the tap fills a focused Scale start price', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    const { store } = renderProMarketWithScaleFlag(true);
    unwireController = wirePerpsControllerForStore(store);
    await findSizeInput();
    fireEvent.press(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_EXPAND_BUTTON,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    await turnOnSizeOnClick();
    await openScaleOrderForm();
    fireEvent(screen.getByTestId(ids.SCALE_START_PRICE), 'focus');

    await tapBid();

    await waitFor(() =>
      expect(screen.getByTestId(ids.SCALE_START_PRICE)).toHaveProp(
        'value',
        formatPerpsInput('2490'),
      ),
    );
    fireEvent.press(screen.getByTestId(`${ids.SCALE_END_PRICE}-field`));
    fireEvent.changeText(screen.getByTestId(ids.SCALE_END_PRICE), '2990');
    fireEvent.press(screen.getByTestId(`${ids.SCALE_TOTAL_ORDERS}-field`));
    fireEvent.changeText(screen.getByTestId(ids.SCALE_TOTAL_ORDERS), '3');

    // $722.10 over a 2,490 to 2,990 ladder would size 0.27 ETH from the amount.
    expect(await placeAndReadOrder()).toEqual(
      expect.objectContaining({
        orderType: 'scale',
        scaleMinPrice: '2490',
        scaleMaxPrice: '2990',
        scaleNumOrders: 3,
        size: '0.29',
      }),
    );
  });

  it('keeps the row size when the tap fills a focused Chase distance', async () => {
    serveLadder(ladderLevel('2400', '0.29'));
    const { store } = renderChaseProMarket();
    unwireController = wirePerpsControllerForStore(store);
    await findSizeInput();
    fireEvent.press(
      await screen.findByTestId(
        PerpsProMarketViewSelectorsIDs.ORDER_BOOK_EXPAND_BUTTON,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    await turnOnSizeOnClick();
    await openChaseOrderForm();
    fireEvent(screen.getByTestId(ids.CHASE_MAX_DISTANCE_INPUT), 'focus');

    await tapBid();

    await waitFor(() =>
      expect(screen.getByTestId(ids.CHASE_MAX_DISTANCE_INPUT)).toHaveProp(
        'value',
        formatPerpsInput('100'),
      ),
    );
    // $696.00 at the 2,500 live price would size 0.28 ETH from the amount.
    const order = await placeAndReadOrder();
    expect(order).toEqual(
      expect.objectContaining({ orderType: 'chase', size: '0.29' }),
    );
    expect(order).not.toHaveProperty('usdAmount');
  });

  // 0.0002 BTC at 49,990 is $9.998, which reads as $10.00 once rounded to cents.
  it.each(['0.0001', '0.0002'])(
    'raises a %s BTC row below the market minimum to that minimum',
    async (rowSize) => {
      const market = {
        ...createBtcMarketForViews(),
        providerId: 'hyperliquid' as const,
        szDecimals: 5,
      };
      serveLadder(ladderLevel('49990', rowSize), '50000');
      renderPerpsProMarketView({
        initialParams: { market },
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
          marketData: [market],
          prices: {
            BTC: {
              symbol: 'BTC',
              price: '50000',
              markPrice: '50000',
              percentChange24h: '0',
              timestamp: Date.now(),
              isTradable: true,
            },
          },
        },
        overrides: {
          engine: {
            backgroundState: {
              PerpsController: {
                proLayoutPreferences: { orderBookExpanded: true },
              },
            },
          },
        },
      });
      await findSizeInput();
      await turnOnSizeOnClick();

      await tapBid();

      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
          'value',
          formatPerpsInput('10'),
        ),
      );
      expect(await placeAndReadOrder()).toEqual(
        expect.objectContaining({ price: '49990', usdAmount: '10' }),
      );
    },
  );

  it('caps a row above the margin limit at the maximum size', async () => {
    // 2 ETH at 2,490 is $4,980, above what $1,000 of margin can open.
    serveLadder(ladderLevel('2490', '2'));
    renderProBook();
    const sizeBefore = (await findSizeInput()).props.value;
    await turnOnSizeOnClick();

    await tapBid();
    let filledSize = sizeBefore;
    await waitFor(() => {
      filledSize = screen.getByTestId(ids.SIZE_INPUT).props.value;
      expect(filledSize).not.toBe(sizeBefore);
    });
    fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 100);
    fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 100);

    // Dragging to MAX at the same price leaves the filled size unchanged.
    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        filledSize,
      ),
    );
    const order = await placeAndReadOrder();
    expect(order).toEqual(expect.objectContaining({ price: '2490' }));
    expect(order.size).not.toBe('2');
  });

  it('sizes from the amount again once the filled price changes', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    await findSizeInput();
    await turnOnSizeOnClick();
    await tapBid();
    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    await waitFor(() =>
      expect(limitInput).toHaveProp('value', formatPerpsInput('2490')),
    );

    fireEvent.changeText(limitInput, '2400');
    fireEvent(limitInput, 'blur');

    // $722.10 at 2,400 covers 0.31 ETH; the row's 0.29 no longer applies.
    expect(await placeAndReadOrder()).toEqual(
      expect.objectContaining({
        price: '2400',
        size: '0.31',
        usdAmount: '722.1',
      }),
    );
  });

  it('sizes from the amount after the size is typed away and back', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    await findSizeInput();
    await turnOnSizeOnClick();
    await tapBid();
    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        formatPerpsInput('722.1'),
      ),
    );

    fireEvent.changeText(screen.getByTestId(ids.SIZE_INPUT), '600');
    fireEvent(screen.getByTestId(ids.SIZE_INPUT), 'blur');
    fireEvent.changeText(screen.getByTestId(ids.SIZE_INPUT), '722.1');
    fireEvent(screen.getByTestId(ids.SIZE_INPUT), 'blur');

    // Typed back to $722.10, the amount sizes the order, not the row's 0.29.
    expect(await placeAndReadOrder()).toEqual(
      expect.objectContaining({
        price: '2490',
        size: '0.30',
        usdAmount: '722.1',
      }),
    );
  });

  it('sizes from the amount after the price is changed away and back', async () => {
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    await findSizeInput();
    await turnOnSizeOnClick();
    await tapBid();
    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    await waitFor(() =>
      expect(limitInput).toHaveProp('value', formatPerpsInput('2490')),
    );

    fireEvent.changeText(limitInput, '2400');
    fireEvent(limitInput, 'blur');
    fireEvent.changeText(limitInput, '2490');
    fireEvent(limitInput, 'blur');

    // Back at 2,490, the amount sizes the order, not the row's 0.29.
    expect(await placeAndReadOrder()).toEqual(
      expect.objectContaining({
        price: '2490',
        size: '0.30',
        usdAmount: '722.1',
      }),
    );
  });

  it('sizes a slider preview from the previewed amount after a row fill', async () => {
    const marginText = () =>
      within(screen.getByTestId(ids.SUMMARY_MARGIN)).getByText(/^\$/).props
        .children;
    serveLadder(ladderLevel('2490', '0.29'));
    renderProBook();
    await findSizeInput();
    await turnOnSizeOnClick();
    await tapBid();
    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        formatPerpsInput('722.1'),
      ),
    );
    const filledMargin = marginText();

    fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 50);

    let previewSize = '';
    let previewMargin = filledMargin;
    await waitFor(() => {
      previewSize = screen.getByTestId(ids.SIZE_INPUT).props.value;
      previewMargin = marginText();
      expect(previewSize).not.toBe(formatPerpsInput('722.1'));
      expect(previewMargin).not.toBe(filledMargin);
    });
    fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 50);

    // The preview already showed the size and margin the release commits.
    await waitFor(() =>
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        previewSize,
      ),
    );
    expect(marginText()).toBe(previewMargin);
  });

  it('fills only the price when the row price is missing', async () => {
    serveLadder(ladderLevel('', '1.5'));
    renderProBook();
    const sizeBefore = (await findSizeInput()).props.value;
    await turnOnSizeOnClick();

    await tapBid();

    expect(await findPriceInput(ids.LIMIT_PRICE_INPUT)).toHaveProp('value', '');
    expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', sizeBefore);
  });

  it.each(['', 'abc', '0'])(
    'fills only the price when the row size is %p',
    async (size) => {
      serveLadder(ladderLevel('2490', size));
      renderProBook();
      const sizeBefore = (await findSizeInput()).props.value;
      await turnOnSizeOnClick();

      await tapBid();

      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      await waitFor(() =>
        expect(limitInput).toHaveProp('value', formatPerpsInput('2490')),
      );
      expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
        'value',
        sizeBefore,
      );
    },
  );
});

describe('Pro market Lighter limit order take profit and stop loss', () => {
  it('blocks a limit order with both TP and SL on a providerless market while Lighter is active', async () => {
    const market = createEthMarketForViews();
    renderPerpsProMarketView({
      initialParams: { market },
      streamOverrides: {
        marketData: [market],
        account: createFundedAccountForViews('1000'),
      },
      overrides: {
        engine: {
          backgroundState: {
            PerpsController: { activeProvider: 'lighter' },
          },
        },
      },
      extraRoutes: [
        {
          name: Routes.PERPS.TPSL,
          Component: PerpsTPSLView as unknown as ComponentType<unknown>,
        },
      ],
    });

    fireEvent.changeText(await findSizeInput(), '10');
    fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
    fireEvent.press(
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION,
        {},
        { timeout: TIMEOUT_MS },
      ),
    );
    fireEvent.changeText(await findPriceInput(ids.LIMIT_PRICE_INPUT), '2600');
    const submit = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.press(screen.getByTestId(ids.TPSL));
    fireEvent.changeText(
      await screen.findByTestId(
        PerpsTPSLViewSelectorsIDs.TAKE_PROFIT_PRICE_INPUT,
      ),
      '2800',
    );
    fireEvent.changeText(
      screen.getByTestId(PerpsTPSLViewSelectorsIDs.STOP_LOSS_PRICE_INPUT),
      '2400',
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(PerpsTPSLViewSelectorsIDs.SET_BUTTON),
      ).toBeEnabled(),
    );
    fireEvent.press(screen.getByTestId(PerpsTPSLViewSelectorsIDs.SET_BUTTON));
    await waitFor(() =>
      expect(
        screen.queryByTestId(PerpsTPSLViewSelectorsIDs.SET_BUTTON),
      ).not.toBeOnTheScreen(),
    );

    expect(
      await screen.findByText(
        strings('perps.order.validation.lighter_limit_tpsl_unsupported'),
      ),
    ).toBeOnTheScreen();
    await waitFor(() => expect(submit).toBeDisabled());
  });
});

describe('PerpsProMarketView section header button location', () => {
  const market = createEthMarketForViews();

  const screenViewedEvent = (trackEventSpy: jest.SpyInstance) =>
    trackEventSpy.mock.calls
      .map(
        ([event]) =>
          event as {
            name?: string;
            properties?: Record<string, unknown>;
          },
      )
      .find(
        (event) =>
          event.name === MetaMetricsEvents.PERPS_SCREEN_VIEWED.category,
      );

  it('forwards button_location on Perp Screen Viewed for a section header tap', async () => {
    const trackEventSpy = jest.spyOn(analytics, 'trackEvent');

    try {
      renderPerpsProMarketView({
        initialParams: {
          market,
          source: 'home_section',
          button_location: 'perps_section_header',
        },
      });

      await waitFor(() => {
        expect(screenViewedEvent(trackEventSpy)?.properties).toEqual(
          expect.objectContaining({
            [PERPS_EVENT_PROPERTY.BUTTON_LOCATION]: 'perps_section_header',
            source: 'home_section',
          }),
        );
      });
    } finally {
      trackEventSpy.mockRestore();
    }
  });

  it('omits button_location on Perp Screen Viewed when the route param is absent', async () => {
    const trackEventSpy = jest.spyOn(analytics, 'trackEvent');

    try {
      renderPerpsProMarketView({
        initialParams: {
          market,
          source: 'home_section',
        },
      });

      await waitFor(() => {
        expect(screenViewedEvent(trackEventSpy)).toEqual(
          expect.objectContaining({
            name: MetaMetricsEvents.PERPS_SCREEN_VIEWED.category,
          }),
        );
      });

      expect(screenViewedEvent(trackEventSpy)?.properties).not.toHaveProperty(
        PERPS_EVENT_PROPERTY.BUTTON_LOCATION,
      );
    } finally {
      trackEventSpy.mockRestore();
    }
  });
});

describe('Pro fee display format', () => {
  const calculateFees = () =>
    Engine.context.PerpsController.calculateFees as jest.Mock;

  afterEach(() => {
    calculateFees().mockReset().mockResolvedValue({});
  });

  const renderTreatmentProMarket = ({
    positionSize,
  }: {
    positionSize?: string;
  } = {}) =>
    renderPerpsProMarketView({
      streamOverrides: {
        account: createFundedAccountForViews('10000'),
        positions: positionSize
          ? [createLongPositionForViews({ size: positionSize })]
          : [],
        orders: [],
      },
      overrides: {
        engine: {
          backgroundState: {
            RemoteFeatureFlagController: {
              remoteFeatureFlags: {
                [FEE_DISPLAY_AB_TEST_KEY]: 'treatment',
              },
            },
          },
        },
      },
    });

  it('renders taker and maker rates for treatment and dollars after reduce-only', async () => {
    calculateFees().mockImplementation(({ isMaker }: { isMaker: boolean }) =>
      Promise.resolve(
        isMaker
          ? { protocolFeeRate: 0.00015, metamaskFeeRate: 0.00005 }
          : { protocolFeeRate: 0.00045, metamaskFeeRate: 0.00005 },
      ),
    );
    renderTreatmentProMarket({ positionSize: '-1' });
    const sizeInput = await findSizeInput();
    fireEvent.changeText(sizeInput, '120');

    await waitFor(() => {
      expect(
        screen.getByTestId(ids.SUMMARY_FEES_VALUE_TAKER),
      ).toHaveTextContent('Taker 0.050% /');
      expect(
        screen.getByTestId(ids.SUMMARY_FEES_VALUE_MAKER),
      ).toHaveTextContent('Maker 0.020%');
    });
    expect(calculateFees()).toHaveBeenCalledWith(
      expect.objectContaining({ orderType: 'limit', isMaker: true }),
    );

    fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));

    await waitFor(() => {
      expect(screen.getByTestId(ids.SUMMARY_FEES_VALUE)).toHaveTextContent(
        '$0.06',
      );
    });
    expect(
      screen.queryByTestId(ids.SUMMARY_FEES_VALUE_TAKER),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId(ids.SUMMARY_FEES_VALUE_MAKER),
    ).not.toBeOnTheScreen();
  });

  it('keeps a treatment TWAP order on the dollar fee', async () => {
    calculateFees().mockImplementation(() =>
      Promise.resolve({
        protocolFeeRate: 0.0005,
        metamaskFeeRate: 0,
      }),
    );
    const { store } = renderProMarketWithTwapFlag(true);
    const remoteFeatureFlagController = store.getState().engine.backgroundState
      .RemoteFeatureFlagController as unknown as {
      remoteFeatureFlags: Record<string, unknown>;
    };
    act(() => {
      syncEngineControllerState(store, 'RemoteFeatureFlagController', {
        ...remoteFeatureFlagController,
        remoteFeatureFlags: {
          ...remoteFeatureFlagController.remoteFeatureFlags,
          [FEE_DISPLAY_AB_TEST_KEY]: 'treatment',
        },
      });
    });
    const { sizeInput } = await openTwapOrderForm();
    calculateFees().mockClear();
    fireEvent.changeText(sizeInput, '120');

    await waitFor(() => {
      expect(screen.getByTestId(ids.SUMMARY_FEES_VALUE)).toHaveTextContent(
        '$0.06',
      );
    });
    expect(
      screen.queryByTestId(ids.SUMMARY_FEES_VALUE_TAKER),
    ).not.toBeOnTheScreen();
    expect(calculateFees()).toHaveBeenCalledWith(
      expect.objectContaining({ orderType: 'twap' }),
    );
    expect(calculateFees()).not.toHaveBeenCalledWith(
      expect.objectContaining({ orderType: 'limit' }),
    );
  });
});
