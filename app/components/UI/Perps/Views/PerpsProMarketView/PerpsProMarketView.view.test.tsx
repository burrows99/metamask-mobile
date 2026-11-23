import {
  TIMEOUT_MS,
  createTwapPickerDate,
  deliverProOrderBook,
  emitEthPrice,
  findPriceInput,
  findSizeInput,
  ids,
  openChaseOrderForm,
  openScaleOrderForm,
  openTwapDurationSheet,
  openTwapOrderForm,
  orderBookValueHeaderId,
  pressTopBid,
  registerPerpsProMarketViewHooks,
  renderChaseProMarket,
  renderFundedProMarket,
  renderProMarketWithScaleFlag,
  renderProMarketWithTriggeredOrdersFlag,
  renderProMarketWithTwapFlag,
  selectTriggeredOrderType,
  showOrderBook,
  syncEngineControllerState,
  triggeredOrderTypeIDs,
} from './PerpsProMarketView.viewTestUtils';
import React from 'react';
import '../../../../../../tests/component-view/mocks';
import {
  act,
  fireEvent,
  screen,
  within,
  waitFor,
} from '@testing-library/react-native';
import { type PerpsOrderCapabilities } from '@metamask/perps-controller';
import { renderPerpsProMarketView } from '../../../../../../tests/component-view/renderers/perpsViewRenderer';
import { wirePerpsControllerForStore } from '../../../../../../tests/component-view/helpers/perpsViewTestHelpers';
import {
  describeForPlatforms,
  itForPlatforms,
} from '../../../../../../tests/component-view/platform';
import {
  createBtcMarketForViews,
  createFundedAccountForViews,
  createEthMarketForViews,
  createLongPositionForViews,
  createShortPositionForViews,
} from '../../../../../../tests/component-view/fixtures/perpsViewFixtures';
import { strings } from '../../../../../../locales/i18n';
import Engine from '../../../../../core/Engine';
import { PERPS_TWAP_UI_CONFIG } from '../../constants/perpsConfig';
import {
  PerpsOrderTypeBottomSheetSelectorsIDs,
  PerpsProMarketViewSelectorsIDs,
  getPerpsProPositionRowSelector,
} from '../../Perps.testIds';
import {
  formatPerpsInput,
  normalizePerpsNumericInput,
} from '../../utils/formatUtils';

registerPerpsProMarketViewHooks();

describeForPlatforms('PerpsProMarketView input journeys', () => {
  itForPlatforms(
    'shows triggered order types when the remote flag is enabled',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));

      expect(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
          {},
          { timeout: TIMEOUT_MS },
        ),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.BASIC_TAB),
      ).toBeOnTheScreen();
      fireEvent.press(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB),
      );
      for (const testID of triggeredOrderTypeIDs) {
        expect(screen.getByTestId(testID)).toBeOnTheScreen();
      }
    },
  );

  itForPlatforms(
    'keeps Basic orders selectable when Lighter cannot execute enabled triggers',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true, 'lighter');
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
      );

      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      ).not.toBeOnTheScreen();
      for (const testID of triggeredOrderTypeIDs) {
        expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
      }
      fireEvent.press(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION),
      );
      expect(await findPriceInput(ids.LIMIT_PRICE_INPUT)).toBeOnTheScreen();
      expect(Engine.context.PerpsController.placeOrder).not.toHaveBeenCalled();
    },
  );

  itForPlatforms(
    'shows only the trigger subset declared by a provider',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true, 'lighter', {
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: [],
        supportedTriggerOrderTypes: ['stop_market', 'take_profit_limit'],
      });
      await findSizeInput();
      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      const tab = await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
      );
      fireEvent.press(tab);

      expect(
        screen.getByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_LIMIT_OPTION,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_MARKET_OPTION,
        ),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'shows all four native Lighter trigger types when the provider declares support',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true, 'lighter', {
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: [],
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
      });
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      );

      for (const testID of triggeredOrderTypeIDs) {
        expect(screen.getByTestId(testID)).toBeOnTheScreen();
      }
      expect(
        Engine.context.PerpsController.getOrderCapabilities,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'ETH', providerId: 'lighter' }),
      );
      expect(Engine.context.PerpsController.placeOrder).not.toHaveBeenCalled();
    },
  );

  itForPlatforms(
    'keeps Basic orders available while trigger capabilities are pending',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(
        true,
        'hyperliquid',
        new Promise<PerpsOrderCapabilities>(() => undefined),
      );
      await findSizeInput();
      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      expect(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'waits for capabilities before declaring a restored trigger draft unavailable',
    async () => {
      let resolveCapabilities = (_capabilities: PerpsOrderCapabilities): void =>
        undefined;
      const capabilities = new Promise<PerpsOrderCapabilities>((resolve) => {
        resolveCapabilities = resolve;
      });
      renderProMarketWithTriggeredOrdersFlag(
        true,
        'hyperliquid',
        capabilities,
        'stop_market',
      );
      await findSizeInput();
      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);

      fireEvent.changeText(triggerInput, '2600');

      expect(screen.getByTestId(ids.ORDER_TYPE_BUTTON)).toHaveTextContent(
        strings('perps.order.type.stop_market.title'),
      );
      expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
      expect(
        screen.queryByTestId(`${ids.NOTICE}-trigger-orders-unavailable`),
      ).not.toBeOnTheScreen();
      expect(Engine.context.PerpsController.placeOrder).not.toHaveBeenCalled();

      await act(async () => {
        resolveCapabilities({
          status: 'unavailable',
          providerId: 'hyperliquid',
          reason: 'not_implemented',
        });
        await capabilities;
      });

      expect(
        await screen.findByTestId(`${ids.NOTICE}-trigger-orders-unavailable`),
      ).toHaveTextContent(
        strings('perps.order.validation.trigger_orders_unavailable'),
      );
      expect(triggerInput).toHaveProp('value', formatPerpsInput('2600'));
      expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
      expect(Engine.context.PerpsController.placeOrder).not.toHaveBeenCalled();
    },
  );

  itForPlatforms(
    'preserves the trigger draft after its rollout is disabled',
    async () => {
      const { store } = renderProMarketWithTriggeredOrdersFlag(true);
      await findSizeInput();
      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
      );
      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '3000');
      const remote =
        store.getState().engine.backgroundState.RemoteFeatureFlagController;
      act(() =>
        syncEngineControllerState(store, 'RemoteFeatureFlagController', {
          ...remote,
          remoteFeatureFlags: {
            ...remote.remoteFeatureFlags,
            perpsProTriggeredOrdersEnabled: {
              enabled: false,
              minimumVersion: '0.0.0',
            },
          },
        }),
      );

      expect(triggerInput).toHaveProp('value', formatPerpsInput('3000'));
      expect(screen.getByTestId(ids.ORDER_TYPE_BUTTON)).toHaveTextContent(
        strings('perps.order.type.stop_market.title'),
      );
      expect(Engine.context.PerpsController.placeOrder).not.toHaveBeenCalled();
      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      expect(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'hides triggered order types when the remote flag is disabled',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(false);
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
        {},
        { timeout: TIMEOUT_MS },
      );

      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TABS),
      ).not.toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION),
      ).toBeOnTheScreen();
      for (const testID of triggeredOrderTypeIDs) {
        expect(screen.queryByTestId(testID)).not.toBeOnTheScreen();
      }
    },
  );

  itForPlatforms(
    'renders TWAP fields and hides incompatible inputs',
    async () => {
      renderProMarketWithTwapFlag(true);
      const { section, durationValue, randomize } = await openTwapOrderForm();

      expect(section).toBeOnTheScreen();
      expect(durationValue).toHaveTextContent('0h 30m');
      expect(
        screen.queryByTestId(ids.TWAP_DURATION_PICKER),
      ).not.toBeOnTheScreen();
      expect(randomize).not.toBeChecked();
      expect(screen.getByTestId(ids.REDUCE_ONLY)).toBeOnTheScreen();
      expect(screen.queryByTestId(ids.LIMIT_PRICE_INPUT)).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(ids.TRIGGER_PRICE_INPUT),
      ).not.toBeOnTheScreen();
      expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
    },
  );

  itForPlatforms('shows and clears TWAP minimum-size validation', async () => {
    renderProMarketWithTwapFlag(true);
    const { sizeInput } = await openTwapOrderForm();

    fireEvent.changeText(sizeInput, '99');

    await waitFor(() => {
      expect(
        screen.getByTestId(`${ids.NOTICE}-twap-min-size`),
      ).toHaveTextContent(
        strings(
          'perps.pro_order_form.twap.minimum_size',
          PERPS_TWAP_UI_CONFIG.MinimumSizeI18nValues,
        ),
      );
      expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
    });

    fireEvent.changeText(sizeInput, '100');

    await waitFor(() => {
      expect(
        screen.queryByTestId(`${ids.NOTICE}-twap-min-size`),
      ).not.toBeOnTheScreen();
    });
  });

  itForPlatforms('configures a randomized TWAP duration', async ({ os }) => {
    renderProMarketWithTwapFlag(true);
    const { sizeInput, randomize } = await openTwapOrderForm();
    const picker = await openTwapDurationSheet();
    const selectedDate = createTwapPickerDate(0, 30);

    fireEvent(
      picker,
      'onChange',
      {
        type: 'set',
        nativeEvent: { timestamp: selectedDate.getTime(), utcOffset: 0 },
      },
      selectedDate,
    );
    if (os === 'ios') {
      fireEvent.press(screen.getByTestId(ids.TWAP_DURATION_SHEET_CLOSE));
    }
    fireEvent.changeText(sizeInput, '100');
    fireEvent.press(randomize);

    await waitFor(
      () => {
        expect(randomize).toBeChecked();
        expect(screen.getByTestId(ids.TWAP_DURATION_VALUE)).toHaveTextContent(
          '0h 30m',
        );
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled();
      },
      { timeout: TIMEOUT_MS },
    );
  });

  itForPlatforms(
    'shows Basic and Advanced tabs when only TWAP is enabled',
    async () => {
      renderProMarketWithTwapFlag(true);
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
        {},
        { timeout: TIMEOUT_MS },
      );

      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.BASIC_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB,
        ),
      ).not.toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
      );

      expect(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.SCALE_OPTION,
        ),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps the shared Advanced sheet when TWAP is absent and supported Scale is enabled',
    async () => {
      renderProMarketWithScaleFlag(true);
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      const advancedTab = await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
        {},
        { timeout: TIMEOUT_MS },
      );
      fireEvent.press(advancedTab);

      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.BASIC_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB),
      ).toBeOnTheScreen();
      expect(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.SCALE_OPTION,
          {},
          { timeout: TIMEOUT_MS },
        ),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps the shared Basic and Triggered sheet when both advanced flags are off',
    async () => {
      renderProMarketWithScaleFlag(false);
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.TABS,
        {},
        { timeout: TIMEOUT_MS },
      );

      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.BASIC_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.SCALE_OPTION,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms('hides TWAP when its remote flag is disabled', async () => {
    renderProMarketWithTwapFlag(false);
    await findSizeInput();

    fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
    await screen.findByTestId(
      PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
      {},
      { timeout: TIMEOUT_MS },
    );

    expect(
      screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
    ).not.toBeOnTheScreen();
  });

  itForPlatforms(
    'hides TWAP for a provider without TWAP placement support',
    async () => {
      renderProMarketWithTwapFlag(true, 'lighter');
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      await screen.findByTestId(
        PerpsOrderTypeBottomSheetSelectorsIDs.MARKET_OPTION,
        {},
        { timeout: TIMEOUT_MS },
      );

      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps the size stable while toggling between USD and the asset',
    async () => {
      renderFundedProMarket();
      const sizeInput = await findSizeInput();
      const unitButton = screen.getByTestId(ids.SIZE_UNIT_BUTTON);

      fireEvent.changeText(sizeInput, '100');
      await waitFor(() => expect(sizeInput).toHaveProp('value', '100'));
      fireEvent.press(unitButton);

      await waitFor(() => {
        expect(sizeInput).toHaveProp('value', '0.04');
        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (ETH)',
        );
      });
      fireEvent.press(unitButton);

      await waitFor(() => {
        expect(sizeInput).toHaveProp('value', '100');
        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (USD)',
        );
      });
    },
  );

  itForPlatforms('keeps coin sizing after opening another market', async () => {
    const { store } = renderPerpsProMarketView({
      streamOverrides: {
        account: createFundedAccountForViews('1000'),
        marketData: [
          createEthMarketForViews({ providerId: 'hyperliquid' }),
          createBtcMarketForViews({ providerId: 'hyperliquid' }),
        ],
        prices: {
          ETH: {
            symbol: 'ETH',
            price: '2500',
            markPrice: '2500',
            percentChange24h: '2',
            timestamp: 1,
            isTradable: true,
          },
          BTC: {
            symbol: 'BTC',
            price: '50000',
            markPrice: '50000',
            percentChange24h: '1',
            timestamp: 1,
            isTradable: true,
          },
        },
        positions: [createShortPositionForViews()],
      },
    });
    const unwire = wirePerpsControllerForStore(store);
    const sizeInput = await findSizeInput();
    fireEvent.changeText(sizeInput, '100');
    await waitFor(() => expect(sizeInput).toHaveProp('value', '100'));
    fireEvent.press(screen.getByTestId(ids.SIZE_UNIT_BUTTON));
    await waitFor(() => {
      expect(sizeInput).toHaveProp('value', '0.04');
      expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
        'Size (ETH)',
      );
    });
    // ETH szDecimals is 2, so a third decimal place is rejected.
    fireEvent.changeText(sizeInput, '0.123');
    expect(sizeInput).toHaveProp('value', '0.04');
    expect(
      (
        store.getState().engine.backgroundState.PerpsController as {
          orderBookPreferences?: { currency?: string };
        }
      ).orderBookPreferences?.currency,
    ).toBe('base');

    const btcRow = await screen.findByTestId(
      getPerpsProPositionRowSelector('BTC'),
      {},
      { timeout: TIMEOUT_MS },
    );
    fireEvent.press(within(btcRow).getByText('BTC'));

    await waitFor(() => {
      expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
        'Size (BTC)',
      );
    });
    const nextSizeInput = screen.getByTestId(ids.SIZE_INPUT);
    // BTC szDecimals is 5. A sixth decimal is rejected once market data lands.
    // Stay under the balance cap so the draft is not clamped back to USD.
    await waitFor(() => {
      fireEvent.changeText(nextSizeInput, '0.00123');
      fireEvent.changeText(nextSizeInput, '0.001234');
      expect(nextSizeInput).toHaveProp('value', '0.00123');
    });
    unwire();
  });

  itForPlatforms(
    'opens the size field and order book in the saved coin denomination',
    async () => {
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
        },
        overrides: {
          engine: {
            backgroundState: {
              PerpsController: {
                orderBookPreferences: { currency: 'base', metric: 'total' },
                proLayoutPreferences: { orderBookExpanded: true },
              },
            },
          },
        },
      });
      await findSizeInput();
      await screen.findByTestId(
        orderBookValueHeaderId,
        {},
        { timeout: TIMEOUT_MS },
      );

      expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
        'Size (ETH)',
      );
      expect(screen.getByTestId(orderBookValueHeaderId)).toHaveTextContent(
        'Total (ETH)',
      );
    },
  );

  itForPlatforms(
    'keeps the size field and order book on the same denomination',
    async () => {
      const mounted = renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
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
      const unwire = wirePerpsControllerForStore(mounted.store);

      try {
        const sizeInput = await findSizeInput();
        await screen.findByTestId(
          orderBookValueHeaderId,
          {},
          { timeout: TIMEOUT_MS },
        );

        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (USD)',
        );
        expect(screen.getByTestId(orderBookValueHeaderId)).toHaveTextContent(
          'Total ($)',
        );

        fireEvent.changeText(sizeInput, '100');
        await waitFor(() => expect(sizeInput).toHaveProp('value', '100'));
        fireEvent.press(screen.getByTestId(ids.SIZE_UNIT_BUTTON));

        await waitFor(() => {
          expect(sizeInput).toHaveProp('value', '0.04');
          expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
            'Size (ETH)',
          );
          expect(screen.getByTestId(orderBookValueHeaderId)).toHaveTextContent(
            'Total (ETH)',
          );
        });

        fireEvent.press(
          screen.getByTestId(
            `${PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL}-grouping-trigger`,
          ),
        );
        fireEvent.press(
          await screen.findByTestId(
            `${PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL}-config-sheet-currency-usd`,
          ),
        );
        fireEvent.press(
          screen.getByTestId(
            `${PerpsProMarketViewSelectorsIDs.ORDER_BOOK_PANEL}-config-sheet-apply`,
          ),
        );

        await waitFor(() => {
          expect(sizeInput).toHaveProp('value', '100');
          expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
            'Size (USD)',
          );
          expect(screen.getByTestId(orderBookValueHeaderId)).toHaveTextContent(
            'Total ($)',
          );
        });
      } finally {
        unwire();
      }
    },
  );

  itForPlatforms(
    'keeps asset sizing available when Scale ladder prices differ from the market',
    async () => {
      renderProMarketWithScaleFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      fireEvent.press(screen.getByTestId(ids.SIZE_UNIT_BUTTON));
      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (ETH)',
        ),
      );

      await openScaleOrderForm();
      fireEvent.press(screen.getByTestId(`${ids.SCALE_START_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_START_PRICE), '2000');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_END_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_END_PRICE), '2200');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_TOTAL_ORDERS}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_TOTAL_ORDERS), '3');

      await waitFor(() => {
        expect(sizeInput).toHaveProp('value', '0.04');
        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (ETH)',
        );
        expect(screen.getByTestId(ids.SIZE_UNIT_BUTTON)).toBeEnabled();
      });

      fireEvent.press(screen.getByTestId(ids.SIZE_UNIT_BUTTON));

      await waitFor(() => {
        expect(sizeInput).toHaveProp('value', '100');
        expect(screen.getByTestId(ids.SIZE_UNIT_LABEL)).toHaveTextContent(
          'Size (USD)',
        );
      });
    },
  );

  itForPlatforms(
    'clears a fully accepted Lighter Scale draft despite an overall failed result',
    async () => {
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      placeOrder.mockResolvedValueOnce({
        success: false,
        acceptedSize: '0.03',
        acceptedChildren: [
          { state: 'resting', orderId: 'scale-child-1' },
          { state: 'resting', orderId: 'scale-child-2' },
          { state: 'resting', orderId: 'scale-child-3' },
        ],
      });
      const getScalePriceLadder = jest.mocked(
        Engine.context.PerpsController.getScalePriceLadder,
      );
      getScalePriceLadder.mockResolvedValue({
        status: 'ready',
        providerId: 'lighter',
        prices: ['2000', '2100', '2200'],
        sizingPreview: {
          sizes: ['0.01', '0.01', '0.01'],
          totalSize: '0.03',
          totalNotional: '63',
          minimumBaseSize: '0.001',
          minimumQuoteAmount: '10',
          sizeDecimals: 3,
        },
      });
      renderProMarketWithScaleFlag(true, 'lighter');
      const sizeInput = await openScaleOrderForm();
      fireEvent.changeText(sizeInput, '100');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_START_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_START_PRICE), '2000');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_END_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_END_PRICE), '2200');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_TOTAL_ORDERS}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_TOTAL_ORDERS), '3');
      await waitFor(
        () => expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled(),
        { timeout: TIMEOUT_MS },
      );

      fireEvent.press(screen.getByTestId(ids.PLACE_ORDER_BUTTON));

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledTimes(1);
          expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', '');
          expect(screen.getByTestId(ids.SCALE_START_PRICE)).toHaveProp(
            'value',
            '',
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'previews slider sizing live and keeps it after drag-end commit',
    async () => {
      renderFundedProMarket();
      await findSizeInput();
      const initialValue = screen.getByTestId(ids.SIZE_INPUT).props.value;

      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 50);

      await waitFor(() => {
        const updatedSizeInput = screen.getByTestId(ids.SIZE_INPUT);
        expect(updatedSizeInput.props.value).not.toBe(initialValue);
        expect(
          Number(normalizePerpsNumericInput(updatedSizeInput.props.value)),
        ).toBeGreaterThan(0);
      });
      const previewValue = screen.getByTestId(ids.SIZE_INPUT).props.value;
      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 50);

      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
          'value',
          previewValue,
        ),
      );
    },
  );

  itForPlatforms(
    'keeps the CTA enabled without loading during live price validation',
    async () => {
      const validateOrder = jest.mocked(
        Engine.context.PerpsController.validateOrder,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      let resolvePendingValidation:
        | ((result: { isValid: boolean }) => void)
        | undefined;
      const pendingValidation = new Promise<{ isValid: boolean }>((resolve) => {
        resolvePendingValidation = resolve;
      });
      validateOrder.mockClear();
      validateOrder.mockResolvedValue({ isValid: true });
      placeOrder.mockClear();

      const { stream } = renderFundedProMarket();
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      fireEvent(sizeInput, 'blur');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      await waitFor(() => expect(placeOrderButton).toBeEnabled(), {
        timeout: TIMEOUT_MS,
      });

      validateOrder.mockReturnValue(pendingValidation);
      await new Promise<void>((resolve) => setTimeout(resolve, 1100));
      emitEthPrice(stream);

      await waitFor(() => {
        expect(placeOrderButton).toBeOnTheScreen();
        expect(placeOrderButton).toBeEnabled();
        expect(placeOrderButton.props.accessibilityState).toEqual(
          expect.objectContaining({ disabled: false }),
        );
        expect(placeOrderButton.props.accessibilityState).not.toEqual(
          expect.objectContaining({ busy: true }),
        );
      });
      expect(placeOrder).not.toHaveBeenCalled();

      await act(async () => {
        resolvePendingValidation?.({ isValid: true });
        await pendingValidation;
      });
      validateOrder.mockResolvedValue({ isValid: true });

      await waitFor(() => {
        expect(placeOrderButton).toBeEnabled();
      });
    },
  );

  itForPlatforms(
    'blocks reduce-only orders when there is no open position',
    async () => {
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
          positions: [],
          orders: [],
        },
      });
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));

      await waitFor(() => {
        expect(
          screen.getByTestId(`${ids.NOTICE}-reduce-only`),
        ).toHaveTextContent(
          strings('perps.order.validation.reduce_only_no_position'),
        );
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', '');
      });

      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 50);
      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 50);

      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', ''),
      );
    },
  );

  itForPlatforms(
    'blocks reduce-only orders that match the open position direction',
    async () => {
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
          positions: [createLongPositionForViews()],
          orders: [],
        },
      });
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));

      await waitFor(() => {
        expect(
          screen.getByTestId(`${ids.NOTICE}-reduce-only`),
        ).toHaveTextContent(
          strings('perps.order.validation.reduce_only_wrong_side'),
        );
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', '');
      });

      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 50);
      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 50);

      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp('value', ''),
      );
    },
  );

  itForPlatforms(
    'blocks reduce-only orders when size exceeds the open position',
    async () => {
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('100000'),
          positions: [createLongPositionForViews({ size: '-1' })],
          orders: [],
        },
      });
      const sizeInput = await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));
      fireEvent.changeText(sizeInput, '3000');

      await waitFor(() => {
        expect(
          screen.getByTestId(`${ids.NOTICE}-reduce-only`),
        ).toHaveTextContent(
          strings('perps.order.validation.reduce_only_too_large'),
        );
        expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
        expect(sizeInput).toHaveProp('value', formatPerpsInput('3000'));
      });
    },
  );

  itForPlatforms(
    'sets the size slider max to the open position when Reduce Only is selected',
    async () => {
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('100'),
          positions: [createLongPositionForViews({ size: '-1' })],
          orders: [],
        },
      });
      await findSizeInput();
      const slider = screen.getByTestId(ids.SIZE_SLIDER);

      fireEvent(slider, 'valueChange', 2500);
      fireEvent(slider, 'dragEnd', 2500);

      await waitFor(() => {
        const marginCappedAmount = Number(
          normalizePerpsNumericInput(
            screen.getByTestId(ids.SIZE_INPUT).props.value,
          ),
        );
        expect(marginCappedAmount).toBeGreaterThan(0);
        expect(marginCappedAmount).toBeLessThan(2500);
      });

      fireEvent.press(screen.getByTestId(ids.REDUCE_ONLY));

      await waitFor(() => {
        expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
      });

      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'valueChange', 2500);
      fireEvent(screen.getByTestId(ids.SIZE_SLIDER), 'dragEnd', 2500);

      await waitFor(() =>
        expect(screen.getByTestId(ids.SIZE_INPUT)).toHaveProp(
          'value',
          formatPerpsInput('2500'),
        ),
      );
    },
  );

  itForPlatforms(
    'warns about an invalid stop-market price on blur without blocking it',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      expect(screen.queryByTestId(ids.LIMIT_PRICE_INPUT)).not.toBeOnTheScreen();
      expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
      fireEvent.changeText(triggerInput, '1000');

      // Mid-typing, the form stays quiet rather than judging a half-entered price.
      await waitFor(
        () => {
          expect(
            screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
          ).not.toBeOnTheScreen();
        },
        { timeout: TIMEOUT_MS },
      );

      fireEvent(triggerInput, 'blur');

      // A stop on the wrong side of mid is advice, not a blocker: the user is
      // told about it and can still place the order.
      await waitFor(
        () => {
          expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
            strings('perps.order.validation.trigger_must_be_above_mid'),
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'warns about a long take-market trigger above mid without blocking it',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_MARKET_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '3000');
      fireEvent(triggerInput, 'blur');

      await waitFor(
        () => {
          expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
            strings('perps.order.validation.trigger_must_be_below_mid'),
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'warns about a short stop-limit trigger above mid without blocking it',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      fireEvent.press(screen.getByTestId(ids.DIRECTION_SHORT));

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '3000');
      fireEvent.changeText(limitInput, '2950');
      fireEvent(limitInput, 'blur');

      expect(
        screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
      ).not.toBeOnTheScreen();

      fireEvent(triggerInput, 'blur');

      await waitFor(
        () => {
          expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
            strings('perps.order.validation.trigger_must_be_below_mid'),
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'warns about a short take-limit trigger below mid without blocking it',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      fireEvent.press(screen.getByTestId(ids.DIRECTION_SHORT));

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_LIMIT_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '1000');
      fireEvent.changeText(limitInput, '950');
      fireEvent(limitInput, 'blur');

      expect(
        screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
      ).not.toBeOnTheScreen();

      fireEvent(triggerInput, 'blur');

      await waitFor(
        () => {
          expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
            strings('perps.order.validation.trigger_must_be_above_mid'),
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeEnabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms('defers required trigger guidance until blur', async () => {
    renderProMarketWithTriggeredOrdersFlag(true);
    const sizeInput = await findSizeInput();
    fireEvent.changeText(sizeInput, '100');

    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
    );

    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);

    await waitFor(
      () => {
        expect(
          screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
        ).not.toBeOnTheScreen();
        expect(placeOrderButton).toBeDisabled();
      },
      { timeout: TIMEOUT_MS },
    );

    fireEvent(triggerInput, 'blur');

    await waitFor(
      () => {
        expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
          strings('perps.order.validation.please_set_a_trigger_price'),
        );
        expect(placeOrderButton).toBeDisabled();
      },
      { timeout: TIMEOUT_MS },
    );
  });

  itForPlatforms(
    'blocks an empty ordinary limit price before showing blur guidance',
    async () => {
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION,
          {},
          { timeout: TIMEOUT_MS },
        ),
      );

      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      expect(
        screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
      ).not.toBeOnTheScreen();
      expect(placeOrderButton).toBeDisabled();

      fireEvent(limitInput, 'blur');

      await waitFor(
        () => {
          expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
            strings('perps.order.validation.limit_price_required'),
          );
          expect(placeOrderButton).toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms('defers required limit guidance until blur', async () => {
    renderProMarketWithTriggeredOrdersFlag(true);
    const sizeInput = await findSizeInput();
    fireEvent.changeText(sizeInput, '100');

    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
    );

    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
    const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
    fireEvent.changeText(triggerInput, '2600');

    await waitFor(
      () => {
        expect(
          screen.queryByTestId(ids.PRICE_CARD_MESSAGE),
        ).not.toBeOnTheScreen();
        expect(placeOrderButton).toBeDisabled();
      },
      { timeout: TIMEOUT_MS },
    );

    fireEvent(limitInput, 'blur');

    await waitFor(
      () => {
        expect(screen.getByTestId(ids.PRICE_CARD_MESSAGE)).toHaveTextContent(
          strings('perps.order.validation.limit_price_required'),
        );
        expect(placeOrderButton).toBeDisabled();
      },
      { timeout: TIMEOUT_MS },
    );
  });

  itForPlatforms(
    'submits a stop-limit order with triggerPrice and limit price',
    async () => {
      const validateOrder = jest.mocked(
        Engine.context.PerpsController.validateOrder,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      validateOrder.mockClear();
      placeOrder.mockClear();
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '2600');
      fireEvent(triggerInput, 'blur');
      fireEvent.changeText(limitInput, '2650');
      fireEvent(limitInput, 'blur');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      let finalValidation: Promise<unknown> | undefined;
      await waitFor(
        () => {
          const validationCallIndex = validateOrder.mock.calls.findIndex(
            ([params]) =>
              params.orderType === 'stop_limit' &&
              params.triggerPrice === '2600' &&
              params.price === '2650',
          );
          expect(validationCallIndex).toBeGreaterThanOrEqual(0);
          finalValidation = validateOrder.mock.results[validationCallIndex]
            ?.value as Promise<unknown>;
        },
        { timeout: TIMEOUT_MS },
      );
      await act(async () => {
        await finalValidation;
      });
      await waitFor(
        () => {
          expect(placeOrderButton).not.toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              orderType: 'stop_limit',
              triggerPrice: '2600',
              price: '2650',
            }),
          );
        },
        { timeout: TIMEOUT_MS },
      );
      expect(placeOrder.mock.calls[0][0]).not.toHaveProperty('takeProfitPrice');
    },
  );

  itForPlatforms(
    'shows the final validation error and skips trigger-limit execution',
    async () => {
      const validateOrder = jest.mocked(
        Engine.context.PerpsController.validateOrder,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      validateOrder.mockClear();
      validateOrder.mockResolvedValue({ isValid: true });
      placeOrder.mockClear();

      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '2600');
      fireEvent(triggerInput, 'blur');
      fireEvent.changeText(limitInput, '2650');
      fireEvent(limitInput, 'blur');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      await waitFor(() => expect(placeOrderButton).toBeEnabled(), {
        timeout: TIMEOUT_MS,
      });

      await waitFor(
        () => {
          const validationCallIndex = validateOrder.mock.calls.findIndex(
            ([params]) =>
              params.orderType === 'stop_limit' &&
              params.triggerPrice === '2600' &&
              params.price === '2650',
          );
          expect(validationCallIndex).toBeGreaterThanOrEqual(0);
        },
        { timeout: TIMEOUT_MS },
      );
      const validationCallIndex = validateOrder.mock.calls.findIndex(
        ([params]) =>
          params.orderType === 'stop_limit' &&
          params.triggerPrice === '2600' &&
          params.price === '2650',
      );
      await act(async () => {
        await validateOrder.mock.results[validationCallIndex]?.value;
      });

      validateOrder.mockResolvedValueOnce({
        isValid: false,
        error: 'Final validation failed',
      });
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(
            screen.getByTestId(`${ids.NOTICE}-validation-0`),
          ).toHaveTextContent('Final validation failed');
          expect(placeOrder).not.toHaveBeenCalled();
          expect(placeOrderButton).toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms('submits a stop-market order with triggerPrice', async () => {
    const validateOrder = jest.mocked(
      Engine.context.PerpsController.validateOrder,
    );
    const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
    validateOrder.mockClear();
    placeOrder.mockClear();
    renderProMarketWithTriggeredOrdersFlag(true);
    const sizeInput = await findSizeInput();
    fireEvent.changeText(sizeInput, '100');

    await selectTriggeredOrderType(
      PerpsOrderTypeBottomSheetSelectorsIDs.STOP_MARKET_OPTION,
    );

    const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
    fireEvent.changeText(triggerInput, '2600');
    fireEvent(triggerInput, 'blur');

    const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
    let finalValidation: Promise<unknown> | undefined;
    await waitFor(
      () => {
        const idx = validateOrder.mock.calls.findIndex(
          ([params]) =>
            params.orderType === 'stop_market' &&
            params.triggerPrice === '2600',
        );
        expect(idx).toBeGreaterThanOrEqual(0);
        finalValidation = validateOrder.mock.results[idx]
          ?.value as Promise<unknown>;
      },
      { timeout: TIMEOUT_MS },
    );
    await act(async () => {
      await finalValidation;
    });
    await waitFor(() => expect(placeOrderButton).not.toBeDisabled(), {
      timeout: TIMEOUT_MS,
    });
    fireEvent.press(placeOrderButton);

    await waitFor(
      () => {
        expect(placeOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: 'ETH',
            orderType: 'stop_market',
            triggerPrice: '2600',
          }),
        );
      },
      { timeout: TIMEOUT_MS },
    );
    expect(placeOrder.mock.calls[0][0]).not.toHaveProperty('price');
  });

  itForPlatforms(
    'submits a take-profit-limit order with triggerPrice and limit price',
    async () => {
      const validateOrder = jest.mocked(
        Engine.context.PerpsController.validateOrder,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      validateOrder.mockClear();
      placeOrder.mockClear();
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      fireEvent.press(screen.getByTestId(ids.DIRECTION_SHORT));

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_LIMIT_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '2600');
      fireEvent(triggerInput, 'blur');
      fireEvent.changeText(limitInput, '2650');
      fireEvent(limitInput, 'blur');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      let finalValidation: Promise<unknown> | undefined;
      await waitFor(
        () => {
          const idx = validateOrder.mock.calls.findIndex(
            ([params]) =>
              params.orderType === 'take_profit_limit' &&
              params.triggerPrice === '2600' &&
              params.price === '2650',
          );
          expect(idx).toBeGreaterThanOrEqual(0);
          finalValidation = validateOrder.mock.results[idx]
            ?.value as Promise<unknown>;
        },
        { timeout: TIMEOUT_MS },
      );
      await act(async () => {
        await finalValidation;
      });
      await waitFor(() => expect(placeOrderButton).not.toBeDisabled(), {
        timeout: TIMEOUT_MS,
      });
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              orderType: 'take_profit_limit',
              triggerPrice: '2600',
              price: '2650',
            }),
          );
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'submits a take-profit-market order with triggerPrice',
    async () => {
      const validateOrder = jest.mocked(
        Engine.context.PerpsController.validateOrder,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      validateOrder.mockClear();
      placeOrder.mockClear();
      renderProMarketWithTriggeredOrdersFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');

      await selectTriggeredOrderType(
        PerpsOrderTypeBottomSheetSelectorsIDs.TAKE_PROFIT_MARKET_OPTION,
      );

      const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
      fireEvent.changeText(triggerInput, '2000');
      fireEvent(triggerInput, 'blur');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      let finalValidation: Promise<unknown> | undefined;
      await waitFor(
        () => {
          const idx = validateOrder.mock.calls.findIndex(
            ([params]) =>
              params.orderType === 'take_profit_market' &&
              params.triggerPrice === '2000',
          );
          expect(idx).toBeGreaterThanOrEqual(0);
          finalValidation = validateOrder.mock.results[idx]
            ?.value as Promise<unknown>;
        },
        { timeout: TIMEOUT_MS },
      );
      await act(async () => {
        await finalValidation;
      });
      await waitFor(() => expect(placeOrderButton).not.toBeDisabled(), {
        timeout: TIMEOUT_MS,
      });
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              orderType: 'take_profit_market',
              triggerPrice: '2000',
            }),
          );
        },
        { timeout: TIMEOUT_MS },
      );
      expect(placeOrder.mock.calls[0][0]).not.toHaveProperty('price');
    },
  );

  itForPlatforms(
    'submits a TWAP order with default 30-minute duration',
    async () => {
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      placeOrder.mockClear();
      renderProMarketWithTwapFlag(true);
      const { sizeInput } = await openTwapOrderForm();

      fireEvent.changeText(sizeInput, '100');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      await waitFor(() => expect(placeOrderButton).not.toBeDisabled(), {
        timeout: TIMEOUT_MS,
      });
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              orderType: 'twap',
              twapDuration: 30,
              twapRandomize: false,
            }),
          );
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'shows an invalid-range notice when Scale start price exceeds end price',
    async () => {
      renderProMarketWithScaleFlag(true);
      await findSizeInput();
      await waitFor(() =>
        expect(
          Engine.context.PerpsController.getOrderCapabilities,
        ).toHaveBeenCalled(),
      );
      await act(async () => Promise.resolve());

      await openScaleOrderForm();

      fireEvent.press(screen.getByTestId(`${ids.SCALE_START_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_START_PRICE), '2600');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_END_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_END_PRICE), '2200');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_TOTAL_ORDERS}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_TOTAL_ORDERS), '3');

      await waitFor(
        () => {
          expect(screen.getByTestId(`${ids.NOTICE}-scale`)).toHaveTextContent(
            strings('perps.pro_order_form.scale.validation.invalid_range'),
          );
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'submits a Scale order with a valid price ladder',
    async () => {
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
      placeOrder.mockClear();
      renderProMarketWithScaleFlag(true);
      const sizeInput = await findSizeInput();
      fireEvent.changeText(sizeInput, '100');
      await waitFor(() =>
        expect(
          Engine.context.PerpsController.getOrderCapabilities,
        ).toHaveBeenCalled(),
      );
      await act(async () => Promise.resolve());

      await openScaleOrderForm();

      fireEvent.press(screen.getByTestId(`${ids.SCALE_START_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_START_PRICE), '2200');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_END_PRICE}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_END_PRICE), '2600');
      fireEvent.press(screen.getByTestId(`${ids.SCALE_TOTAL_ORDERS}-field`));
      fireEvent.changeText(screen.getByTestId(ids.SCALE_TOTAL_ORDERS), '3');

      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      await waitFor(() => expect(placeOrderButton).not.toBeDisabled(), {
        timeout: TIMEOUT_MS,
      });
      fireEvent.press(placeOrderButton);

      await waitFor(
        () => {
          expect(placeOrder).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'ETH',
              orderType: 'scale',
              scaleMinPrice: '2200',
              scaleMaxPrice: '2600',
              scaleNumOrders: 3,
              scaleSkew: 1,
            }),
          );
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'shows a max-distance error when Chase max distance is zero',
    async () => {
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
      renderPerpsProMarketView({
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

      const sizeInput = await findSizeInput();
      await waitFor(() =>
        expect(
          Engine.context.PerpsController.getOrderCapabilities,
        ).toHaveBeenCalled(),
      );
      await act(async () => Promise.resolve());
      fireEvent.changeText(sizeInput, '30');

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

      expect(await screen.findByTestId(ids.CHASE_FORM)).toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(`${ids.CHASE_MAX_DISTANCE_INPUT}-field`),
      );
      fireEvent.changeText(
        screen.getByTestId(ids.CHASE_MAX_DISTANCE_INPUT),
        '0',
      );

      await waitFor(
        () => {
          expect(
            screen.getByTestId(`${ids.NOTICE}-chase-max-distance`),
          ).toBeOnTheScreen();
          expect(screen.getByTestId(ids.PLACE_ORDER_BUTTON)).toBeDisabled();
        },
        { timeout: TIMEOUT_MS },
      );
    },
  );

  itForPlatforms(
    'fills a focused Scale start price from an order-book tap without switching type',
    async () => {
      const bookSpy = deliverProOrderBook('2400');
      try {
        const { store } = renderProMarketWithScaleFlag(true);
        showOrderBook(store);
        await openScaleOrderForm();
        fireEvent(screen.getByTestId(ids.SCALE_START_PRICE), 'focus');

        fireEvent.press(await pressTopBid());

        await waitFor(() => {
          expect(screen.getByTestId(ids.SCALE_START_PRICE)).toHaveProp(
            'value',
            formatPerpsInput('2400'),
          );
          expect(screen.getByTestId(ids.ORDER_TYPE_BUTTON)).toHaveTextContent(
            strings('perps.order.type.scale.title'),
          );
        });
      } finally {
        bookSpy.mockRestore();
      }
    },
  );

  itForPlatforms(
    'fills a focused Chase percent distance from an order-book tap',
    async () => {
      const bookSpy = deliverProOrderBook('2550');
      try {
        const { store } = renderChaseProMarket();
        showOrderBook(store);
        await openChaseOrderForm();
        fireEvent.press(screen.getByTestId(ids.CHASE_MAX_DISTANCE_UNIT));
        fireEvent(screen.getByTestId(ids.CHASE_MAX_DISTANCE_INPUT), 'focus');

        fireEvent.press(await pressTopBid());

        await waitFor(() => {
          expect(screen.getByTestId(ids.CHASE_MAX_DISTANCE_INPUT)).toHaveProp(
            'value',
            formatPerpsInput('2'),
          );
          expect(screen.getByTestId(ids.ORDER_TYPE_BUTTON)).toHaveTextContent(
            `${strings('perps.order.type.chase.title')}$2500`,
          );
        });
      } finally {
        bookSpy.mockRestore();
      }
    },
  );

  itForPlatforms(
    'fills a focused stop-limit trigger from an order-book tap and leaves the limit price',
    async () => {
      const bookSpy = deliverProOrderBook('2490');
      try {
        const { store } = renderProMarketWithTriggeredOrdersFlag(true);
        showOrderBook(store);
        await findSizeInput();
        await selectTriggeredOrderType(
          PerpsOrderTypeBottomSheetSelectorsIDs.STOP_LIMIT_OPTION,
        );
        const limitInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
        const triggerInput = await findPriceInput(ids.TRIGGER_PRICE_INPUT);
        fireEvent.changeText(limitInput, '2400');
        fireEvent(triggerInput, 'focus');

        fireEvent.press(await pressTopBid());

        await waitFor(() => {
          expect(triggerInput).toHaveProp('value', formatPerpsInput('2490'));
          expect(limitInput).toHaveProp('value', formatPerpsInput('2400'));
          expect(screen.getByTestId(ids.ORDER_TYPE_BUTTON)).toHaveTextContent(
            strings('perps.order.type.stop_limit.title'),
          );
        });
      } finally {
        bookSpy.mockRestore();
      }
    },
  );
});
