import {
  TIMEOUT_MS,
  activeChase,
  activeTwap,
  completeTwap,
  completeTwapFill,
  findPriceInput,
  findSizeInput,
  ids,
  mockNextTwapOrdersFailure,
  mockTwapOrderSubscription,
  mockTwapOrders,
  openChaseManagementTab,
  openTwapManagementTab,
  registerPerpsProMarketViewHooks,
  renderFundedProMarket,
  renderProMarketWithTwapFlag,
  setDateNowSpy,
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
  type ChaseOrder,
  type Order,
  type TwapOrder,
} from '@metamask/perps-controller';
import { renderPerpsProMarketView } from '../../../../../../tests/component-view/renderers/perpsViewRenderer';
import {
  describeForPlatforms,
  itForPlatforms,
} from '../../../../../../tests/component-view/platform';
import { createFundedAccountForViews } from '../../../../../../tests/component-view/fixtures/perpsViewFixtures';
import { strings } from '../../../../../../locales/i18n';
import Engine from '../../../../../core/Engine';
import Logger from '../../../../../util/Logger';
import { analytics } from '../../../../../util/analytics/analytics';
import { PerpsCacheInvalidator } from '../../services/PerpsCacheInvalidator';
import { isChaseOrderHandleVisible } from '../../services/ChaseOrderVisibility';
import {
  PerpsOrderTypeBottomSheetSelectorsIDs,
  PerpsProMarketViewSelectorsIDs,
  getPerpsProChaseDistanceSelector,
  getPerpsProChaseHandleSelector,
  getPerpsProChaseRepriceSelector,
  getPerpsProChaseRowSelector,
  getPerpsProChaseSideFilterOptionSelector,
  getPerpsProActivityViewSelector,
  getPerpsProChaseStatusSelector,
  getPerpsProChaseTerminateSelector,
  getPerpsProTwapFillValueSelector,
  getPerpsProTwapSideFilterOptionSelector,
  getPerpsProTwapTerminateSelector,
  getPerpsProTwapValueSelector,
} from '../../Perps.testIds';
import { formatProOrderCardTimestamp } from '../../utils/formatUtils';
import { getTwapOrderProviderId } from '../../utils/twapOrderUtils';
import { readPerpsUiObservations } from '../../utils/perpsUiObservations';

registerPerpsProMarketViewHooks();

describeForPlatforms('PerpsProMarketView input journeys', () => {
  itForPlatforms(
    'keeps the tabbed Chase flow available when the TWAP flag is absent',
    async () => {
      const getOrderCapabilities = jest.mocked(
        Engine.context.PerpsController.getOrderCapabilities,
      );
      getOrderCapabilities.mockResolvedValue({
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
      getOrderCapabilities.mockClear();
      renderPerpsProMarketView({
        streamOverrides: {
          account: createFundedAccountForViews('1000'),
        },
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
                  perpsProTriggeredOrdersEnabled: {
                    enabled: true,
                    minimumVersion: '0.0.0',
                  },
                },
              },
            },
          },
        },
      });
      await findSizeInput();
      await waitFor(() =>
        expect(getOrderCapabilities).toHaveBeenCalledWith({
          symbol: 'ETH',
          providerId: 'hyperliquid',
        }),
      );
      await act(async () => {
        await getOrderCapabilities.mock.results.at(-1)?.value;
      });

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      expect(
        await screen.findByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TABS),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.BASIC_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TRIGGERED_TAB),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
      ).toBeOnTheScreen();
      fireEvent.press(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB),
      );
      expect(
        screen.queryByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.TWAP_OPTION),
      ).not.toBeOnTheScreen();
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.CHASE_OPTION,
        ),
      );

      expect(await screen.findByTestId(ids.CHASE_FORM)).toBeOnTheScreen();
      expect(screen.getByTestId(ids.REDUCE_ONLY)).toBeOnTheScreen();
      expect(screen.queryByTestId(ids.LIMIT_PRICE_INPUT)).not.toBeOnTheScreen();
      expect(
        screen.queryByTestId(ids.TRIGGER_PRICE_INPUT),
      ).not.toBeOnTheScreen();
      expect(screen.queryByTestId(ids.TPSL)).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'renders complete TWAP data and switches a same-symbol provider row',
    async () => {
      // Arrange: the elapsed row derives from the wall clock, so pin it to the
      // one minute past `startedAt` this fixture's elapsedTimeMilliseconds
      // describes. Without this the schedule reads as decades old and clamps
      // to its full duration. A Date.now spy keeps timers real, which the
      // async findBy* assertions below depend on.
      setDateNowSpy(
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(completeTwap.startedAt + 60_000),
      );
      mockTwapOrders([completeTwap]);
      renderProMarketWithTwapFlag(true);

      // Act
      await openTwapManagementTab();
      const cardValueTestID = (baseTestID: string) =>
        getPerpsProTwapValueSelector(
          baseTestID,
          getTwapOrderProviderId(completeTwap),
          completeTwap.orderId,
        );

      // Assert: every significant card value crossed the real selector, hook,
      // panel, and formatting path from the async Engine result.
      expect(
        await screen.findByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_MARKET),
        ),
      ).toHaveTextContent('ETH');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_DIRECTION_TAG),
        ),
      ).toHaveTextContent(strings('perps.market.close_short'));
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_REDUCE_ONLY_TAG),
        ),
      ).toHaveTextContent(
        strings('perps.pro_positions_panel.twap_card.reduce_only'),
      );
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_CREATED_AT),
        ),
      ).toHaveTextContent(formatProOrderCardTimestamp(completeTwap.startedAt));
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_STATUS_TAG),
        ),
      ).toHaveTextContent(
        strings('perps.pro_positions_panel.twap_card.status_active'),
      );
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_SIZE),
        ),
      ).toHaveTextContent('10 ETH');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILLED_SIZE),
        ),
      ).toHaveTextContent('4 ETH');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_AVERAGE_PRICE),
        ),
      ).toHaveTextContent('$2,500');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_PROGRESS),
        ),
      ).toHaveTextContent('40%');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_ELAPSED),
        ),
      ).toHaveTextContent('00:01:00 / 00:30:00');
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_RANDOMIZE),
        ),
      ).toHaveTextContent(strings('perps.order_details.yes'));
      expect(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_MARKET_BUTTON),
        ),
      ).toHaveProp(
        'accessibilityLabel',
        expect.stringContaining(strings('perps.market.close_short')),
      );

      // Act / Assert: the route starts on Hyperliquid ETH. A Lighter ETH TWAP
      // must still switch venue, carrying its provider into the remounted form.
      fireEvent.press(
        screen.getByTestId(
          cardValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_MARKET_BUTTON),
        ),
      );
      await waitFor(() =>
        expect(
          Engine.context.PerpsController.getOrderCapabilities,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ symbol: 'ETH', providerId: 'lighter' }),
        ),
      );

      // Act / Assert: TWAP owns a complete side-filter selector family through
      // the real panel and shared sheet.
      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_SIDE_FILTER_BUTTON,
        ),
      );
      expect(
        await screen.findByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_SIDE_FILTER_SHEET,
        ),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_SIDE_FILTER_SHEET_CLOSE,
        ),
      ).toBeOnTheScreen();
      fireEvent.press(
        screen.getByTestId(getPerpsProTwapSideFilterOptionSelector('all')),
      );

      // Act: the activity filter reaches Fill history in one step.
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('fill_history')}`,
        ),
      );
      const fillValueTestID = (baseTestID: string) =>
        getPerpsProTwapFillValueSelector(
          baseTestID,
          getTwapOrderProviderId(completeTwap),
          completeTwap.orderId,
          completeTwapFill.fillId,
        );

      // Assert: actual value elements, not row wrappers, expose all fill data.
      expect(
        screen.getByTestId(
          fillValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILL_MARKET),
        ),
      ).toHaveTextContent('ETH');
      expect(
        screen.getByTestId(
          fillValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILL_DIRECTION),
        ),
      ).toHaveTextContent(strings('perps.market.close_short'));
      expect(
        screen.getByTestId(
          fillValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILL_PRICE),
        ),
      ).toHaveTextContent('$2,500');
      expect(
        screen.getByTestId(
          fillValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILL_TIME),
        ),
      ).toHaveTextContent(
        formatProOrderCardTimestamp(completeTwapFill.timestamp),
      );
      expect(
        screen.getByTestId(
          fillValueTestID(PerpsProMarketViewSelectorsIDs.TWAP_FILL_SIZE),
        ),
      ).toHaveTextContent('1.5 ETH');
    },
  );

  itForPlatforms(
    'withdraws the TWAP tab when rollout turns off mid-session',
    async () => {
      mockTwapOrders([activeTwap]);
      const { store } = renderProMarketWithTwapFlag(true);
      await openTwapManagementTab();
      const terminateTestID = getPerpsProTwapTerminateSelector(
        getTwapOrderProviderId(activeTwap),
        activeTwap.orderId,
      );
      expect(await screen.findByTestId(terminateTestID)).toBeOnTheScreen();
      const remoteFeatureFlagController = store.getState().engine
        .backgroundState.RemoteFeatureFlagController as unknown as {
        remoteFeatureFlags: Record<string, unknown>;
      };

      act(() => {
        syncEngineControllerState(store, 'RemoteFeatureFlagController', {
          ...remoteFeatureFlagController,
          remoteFeatureFlags: {
            ...remoteFeatureFlagController.remoteFeatureFlags,
            perpsMobileTwap: {
              enabled: false,
              minimumVersion: '0.0.0',
            },
          },
        });
      });

      expect(
        screen.queryByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_TWAP,
        ),
      ).not.toBeOnTheScreen();
      expect(screen.queryByTestId(terminateTestID)).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps an accepted TWAP termination disabled after refresh failure until stream confirmation',
    async () => {
      // Arrange
      const getTwapOrders = jest.mocked(
        Engine.context.PerpsController.getTwapOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      let emitTwapOrders:
        | ((orders: TwapOrder[], isSnapshot?: boolean) => void)
        | undefined;
      mockTwapOrders([activeTwap]);
      mockTwapOrderSubscription((callback) => {
        emitTwapOrders = callback;
      });
      cancelOrder.mockClear();
      cancelOrder.mockResolvedValueOnce({ success: true });
      renderProMarketWithTwapFlag(true);
      await openTwapManagementTab();
      const terminateTestID = getPerpsProTwapTerminateSelector(
        getTwapOrderProviderId(activeTwap),
        activeTwap.orderId,
      );
      const terminateButton = await screen.findByTestId(terminateTestID);
      fireEvent.press(terminateButton);
      expect(
        await screen.findByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_SHEET,
        ),
      ).toBeOnTheScreen();
      // Opening the sheet pauses live REST work. Configure the next explicit
      // post-cancel reconciliation only after that user-visible settled state.
      mockNextTwapOrdersFailure(new Error('refresh failed'));
      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_CONFIRM,
        ),
      );

      // Act: the venue accepts cancellation, but reconciliation fails.
      await waitFor(() => expect(cancelOrder).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByTestId(PerpsProMarketViewSelectorsIDs.TWAP_ERROR),
      ).toBeOnTheScreen();

      // Assert: the stale active row cannot submit a second cancellation.
      expect(screen.getByTestId(terminateTestID)).toBeDisabled();
      fireEvent.press(screen.getByTestId(terminateTestID));
      expect(cancelOrder).toHaveBeenCalledTimes(1);

      // Act: the authoritative stream confirms terminal state.
      act(() => {
        emitTwapOrders?.([{ ...activeTwap, status: 'canceled' }], false);
      });

      // Assert
      await waitFor(() =>
        expect(screen.queryByTestId(terminateTestID)).not.toBeOnTheScreen(),
      );
    },
  );

  itForPlatforms(
    'pauses live REST reconciliation while termination confirmation is open and resumes on close',
    async () => {
      // Arrange
      const getTwapOrders = jest.mocked(
        Engine.context.PerpsController.getTwapOrders,
      );
      mockTwapOrders([activeTwap]);
      renderProMarketWithTwapFlag(true);
      await openTwapManagementTab();
      const terminateButton = await screen.findByTestId(
        getPerpsProTwapTerminateSelector(
          getTwapOrderProviderId(activeTwap),
          activeTwap.orderId,
        ),
      );
      const settledReadCount = getTwapOrders.mock.calls.length;

      // Act
      fireEvent.press(terminateButton);

      // Assert: opening confirmation does not trigger another REST read. The
      // interval-level pause is covered in the hook's timer contract test.
      expect(
        await screen.findByTestId(
          PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_SHEET,
        ),
      ).toBeOnTheScreen();
      expect(getTwapOrders).toHaveBeenCalledTimes(settledReadCount);

      // Act
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_CLOSE),
      );

      // Assert: close settles visibly before the resumed reconciliation lands.
      await waitFor(() =>
        expect(
          screen.queryByTestId(
            PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_SHEET,
          ),
        ).not.toBeOnTheScreen(),
      );
      await waitFor(() =>
        expect(getTwapOrders.mock.calls.length).toBeGreaterThan(
          settledReadCount,
        ),
      );
    },
  );

  for (const identityChange of ['account', 'provider', 'network'] as const) {
    itForPlatforms(
      `closes TWAP termination when the ${identityChange} identity changes`,
      async () => {
        mockTwapOrders([activeTwap]);
        const { store } = renderProMarketWithTwapFlag(true);
        await openTwapManagementTab();
        fireEvent.press(
          await screen.findByTestId(
            getPerpsProTwapTerminateSelector(
              getTwapOrderProviderId(activeTwap),
              activeTwap.orderId,
            ),
          ),
        );
        expect(
          await screen.findByTestId(
            PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_SHEET,
          ),
        ).toBeOnTheScreen();

        act(() => {
          if (identityChange === 'account') {
            const accountsController = store.getState().engine.backgroundState
              .AccountsController as unknown as {
              internalAccounts: {
                accounts: Record<string, Record<string, unknown>>;
                selectedAccount: string;
              };
            };
            const selectedAccountId =
              accountsController.internalAccounts.selectedAccount;
            const selectedAccount =
              accountsController.internalAccounts.accounts[selectedAccountId];
            const nextAccountId = 'acc-2';
            syncEngineControllerState(store, 'AccountsController', {
              ...accountsController,
              internalAccounts: {
                ...accountsController.internalAccounts,
                selectedAccount: nextAccountId,
                accounts: {
                  ...accountsController.internalAccounts.accounts,
                  [nextAccountId]: {
                    ...selectedAccount,
                    id: nextAccountId,
                    address: '0x0000000000000000000000000000000000000002',
                  },
                },
              },
            });
            const accountTreeController = store.getState().engine
              .backgroundState.AccountTreeController as unknown as {
              accountTree: {
                wallets: Record<
                  string,
                  {
                    groups: Record<string, Record<string, unknown>>;
                  }
                >;
              };
              selectedAccountGroup: string;
            };
            const selectedGroupId = accountTreeController.selectedAccountGroup;
            const [selectedWalletId] = selectedGroupId.split('/');
            const selectedWallet =
              accountTreeController.accountTree.wallets[selectedWalletId];
            const selectedGroup = selectedWallet.groups[selectedGroupId];
            syncEngineControllerState(store, 'AccountTreeController', {
              ...accountTreeController,
              accountTree: {
                ...accountTreeController.accountTree,
                wallets: {
                  ...accountTreeController.accountTree.wallets,
                  [selectedWalletId]: {
                    ...selectedWallet,
                    groups: {
                      ...selectedWallet.groups,
                      [selectedGroupId]: {
                        ...selectedGroup,
                        accounts: [nextAccountId],
                      },
                    },
                  },
                },
              },
            });
            return;
          }

          const perpsController = store.getState().engine.backgroundState
            .PerpsController as unknown as Record<string, unknown>;
          syncEngineControllerState(store, 'PerpsController', {
            ...perpsController,
            ...(identityChange === 'provider'
              ? { activeProvider: 'lighter' }
              : { isTestnet: true }),
          });
        });

        await waitFor(() =>
          expect(
            screen.queryByTestId(
              PerpsProMarketViewSelectorsIDs.TWAP_TERMINATE_SHEET,
            ),
          ).not.toBeOnTheScreen(),
        );
      },
    );
  }

  itForPlatforms(
    'records the hook cancellation result after pressing the Chase terminate control',
    async () => {
      const savedDev = __DEV__;
      (globalThis as { __DEV__?: boolean }).__DEV__ = true;
      try {
        const cursor = readPerpsUiObservations().cancellationSequence;
        const outcome = { success: true, orderId: activeChase.handle };
        const cancelOrder = jest.mocked(
          Engine.context.PerpsController.cancelOrder,
        );
        cancelOrder.mockResolvedValue(outcome);
        jest
          .mocked(Engine.context.PerpsController.getChaseOrders)
          .mockResolvedValueOnce([activeChase])
          .mockResolvedValue([]);
        renderFundedProMarket();
        await openChaseManagementTab();

        fireEvent.press(
          await screen.findByTestId(
            getPerpsProChaseTerminateSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        );

        await waitFor(() => {
          expect(cancelOrder).toHaveBeenCalledTimes(1);
          expect(cancelOrder).toHaveBeenCalledWith({
            orderId: activeChase.handle,
            symbol: 'ETH',
            orderType: 'chase',
          });
          expect(
            readPerpsUiObservations().cancellations.filter(
              (item) => item.sequence > cursor,
            ),
          ).toEqual([
            expect.objectContaining({
              request: {
                orderId: activeChase.handle,
                symbol: 'ETH',
                orderType: 'chase',
              },
              state: 'settled',
              result: outcome,
            }),
          ]);
        });
      } finally {
        (globalThis as { __DEV__?: boolean }).__DEV__ = savedDev;
      }
    },
  );

  itForPlatforms(
    'retains canceled History when the controller omits the terminated session',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      jest
        .mocked(Engine.context.PerpsController.getOrders)
        .mockResolvedValueOnce([]);
      getChaseOrders.mockResolvedValueOnce([activeChase]).mockResolvedValue([]);
      cancelOrder.mockClear();
      renderFundedProMarket();

      await openChaseManagementTab();
      const rowSelector = getPerpsProChaseRowSelector(
        'ETH',
        activeChase.handle,
        true,
      );
      expect(await screen.findByTestId(rowSelector)).toBeOnTheScreen();
      fireEvent.press(
        screen.getByTestId(
          getPerpsProChaseTerminateSelector(
            'active',
            'ETH',
            activeChase.handle,
            true,
          ),
        ),
      );

      await waitFor(() => {
        expect(cancelOrder).toHaveBeenCalledWith({
          orderId: activeChase.handle,
          symbol: 'ETH',
          orderType: 'chase',
        });
      });
      await waitFor(() => {
        expect(screen.queryByTestId(rowSelector)).not.toBeOnTheScreen();
      });
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );
      const canceledStatusSelector = getPerpsProChaseStatusSelector(
        'canceled',
        'ETH',
        activeChase.handle,
        true,
      );
      expect(
        await screen.findByTestId(canceledStatusSelector),
      ).toHaveTextContent(strings('perps.order.chase.status.canceled'));

      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_FILLED_ONLY),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId(canceledStatusSelector),
        ).not.toBeOnTheScreen(),
      );
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_FILLED_ONLY),
      );
      expect(
        await screen.findByTestId(canceledStatusSelector),
      ).toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_POSITIONS,
        ),
      );
      await openChaseManagementTab();

      expect(
        await screen.findByTestId(canceledStatusSelector),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'shows canceled History when the controller returns canceled after termination',
    async () => {
      const canceledChase: ChaseOrder = {
        ...activeChase,
        status: 'canceled',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      getChaseOrders
        .mockResolvedValueOnce([activeChase])
        .mockResolvedValueOnce([canceledChase]);
      cancelOrder.mockClear();
      renderFundedProMarket();

      await openChaseManagementTab();
      fireEvent.press(
        screen.getByTestId(
          getPerpsProChaseTerminateSelector(
            'active',
            'ETH',
            activeChase.handle,
            true,
          ),
        ),
      );
      await waitFor(() => expect(cancelOrder).toHaveBeenCalledTimes(1));
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );

      expect(
        await screen.findByTestId(
          getPerpsProChaseStatusSelector(
            'canceled',
            'ETH',
            canceledChase.handle,
            true,
          ),
        ),
      ).toHaveTextContent(strings('perps.order.chase.status.canceled'));
    },
  );

  itForPlatforms(
    'tracks Chase termination only after acceptance with the asset payload',
    async () => {
      let resolveCancellation:
        | ((result: { success: boolean }) => void)
        | undefined;
      const partiallyFilledChase = {
        ...activeChase,
        remainingSize: '0.25',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      const trackEventSpy = jest.spyOn(analytics, 'trackEvent');
      getChaseOrders
        .mockResolvedValueOnce([partiallyFilledChase])
        .mockResolvedValue([]);
      cancelOrder.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCancellation = resolve;
          }),
      );
      try {
        renderFundedProMarket();
        await openChaseManagementTab();
        cancelOrder.mockClear();
        trackEventSpy.mockClear();

        fireEvent.press(
          screen.getByTestId(
            getPerpsProChaseTerminateSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        );

        expect(trackEventSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Perp UI Interaction',
            properties: expect.objectContaining({
              interaction_type: 'chase_terminated',
            }),
          }),
        );
        await act(async () => resolveCancellation?.({ success: true }));
        await waitFor(() =>
          expect(trackEventSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'Perp UI Interaction',
              properties: expect.objectContaining({
                interaction_type: 'chase_terminated',
                asset: 'ETH',
                fill_pct_at_terminate: 75,
              }),
            }),
          ),
        );
      } finally {
        trackEventSpy.mockRestore();
      }
    },
  );

  itForPlatforms(
    'omits Chase termination analytics when cancellation is rejected',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      const trackEventSpy = jest.spyOn(analytics, 'trackEvent');
      getChaseOrders.mockResolvedValue([activeChase]);
      cancelOrder.mockResolvedValueOnce({ success: false, error: 'rejected' });
      try {
        renderFundedProMarket();
        await openChaseManagementTab();
        cancelOrder.mockClear();
        trackEventSpy.mockClear();

        fireEvent.press(
          screen.getByTestId(
            getPerpsProChaseTerminateSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        );
        await waitFor(() => expect(cancelOrder).toHaveBeenCalledTimes(1));

        expect(trackEventSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Perp UI Interaction',
            properties: expect.objectContaining({
              interaction_type: 'chase_terminated',
            }),
          }),
        );
      } finally {
        trackEventSpy.mockRestore();
      }
    },
  );

  itForPlatforms(
    'retries termination while Chase termination is pending',
    async () => {
      const pendingChase: ChaseOrder = {
        ...activeChase,
        status: 'termination_pending',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      getChaseOrders.mockResolvedValue([pendingChase]);
      cancelOrder.mockClear();
      renderFundedProMarket();

      await openChaseManagementTab();
      expect(
        await screen.findByTestId(
          getPerpsProChaseStatusSelector(
            'termination_pending',
            'ETH',
            pendingChase.handle,
            true,
          ),
        ),
      ).toHaveTextContent(
        strings('perps.order.chase.status.termination_pending'),
      );
      fireEvent.press(
        screen.getByTestId(
          getPerpsProChaseTerminateSelector(
            'termination_pending',
            'ETH',
            pendingChase.handle,
            true,
          ),
        ),
      );

      await waitFor(() =>
        expect(cancelOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: pendingChase.handle,
            orderType: 'chase',
          }),
        ),
      );
    },
  );

  itForPlatforms(
    'registers only handles visible on the active Pro Chase tab',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([activeChase]);
      renderFundedProMarket();

      expect(isChaseOrderHandleVisible(activeChase.handle)).toBe(false);
      await openChaseManagementTab();

      await waitFor(() =>
        expect(isChaseOrderHandleVisible(activeChase.handle)).toBe(true),
      );
      expect(isChaseOrderHandleVisible('other-chase')).toBe(false);

      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );
      await waitFor(() =>
        expect(isChaseOrderHandleVisible(activeChase.handle)).toBe(false),
      );

      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_ORDERS,
        ),
      );
      expect(isChaseOrderHandleVisible(activeChase.handle)).toBe(false);
    },
  );

  itForPlatforms(
    'binds the compatible primary terminate control to its exact Chase handle',
    async () => {
      const unrelated: ChaseOrder = {
        ...activeChase,
        handle: 'unrelated-chase',
      };
      jest
        .mocked(Engine.context.PerpsController.getChaseOrders)
        .mockResolvedValue([activeChase, unrelated]);
      renderFundedProMarket();

      await openChaseManagementTab();
      const primary = await screen.findByTestId(
        getPerpsProChaseHandleSelector('ETH', activeChase.handle),
      );
      const other = screen.getByTestId(
        getPerpsProChaseHandleSelector('ETH', unrelated.handle),
      );
      const compatible = getPerpsProChaseTerminateSelector(
        'active',
        'ETH',
        activeChase.handle,
        true,
      );

      expect(within(primary).getByTestId(compatible)).toBeOnTheScreen();
      expect(within(other).queryByTestId(compatible)).toBeNull();
      expect(
        within(other).getByTestId(
          getPerpsProChaseTerminateSelector(
            'active',
            'ETH',
            unrelated.handle,
            false,
          ),
        ),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps the existing handler bound to its handle when a different primary Chase row leaves',
    async () => {
      const unrelated = { ...activeChase, handle: 'unrelated-primary' };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      getChaseOrders
        .mockResolvedValueOnce([unrelated, activeChase])
        .mockResolvedValue([activeChase]);
      cancelOrder.mockClear();
      renderFundedProMarket();
      await openChaseManagementTab();
      const ownedSelector = getPerpsProChaseHandleSelector(
        'ETH',
        activeChase.handle,
      );
      const primarySelector = getPerpsProChaseTerminateSelector(
        'active',
        'ETH',
        unrelated.handle,
        true,
      );
      expect(
        within(await screen.findByTestId(ownedSelector)).getByTestId(
          getPerpsProChaseTerminateSelector(
            'active',
            'ETH',
            activeChase.handle,
            false,
          ),
        ),
      ).toBeOnTheScreen();
      fireEvent.press(
        within(
          screen.getByTestId(
            getPerpsProChaseHandleSelector('ETH', unrelated.handle),
          ),
        ).getByTestId(primarySelector),
      );
      await waitFor(() =>
        expect(
          within(screen.getByTestId(ownedSelector)).getByTestId(
            primarySelector,
          ),
        ).toBeOnTheScreen(),
      );
      cancelOrder.mockClear();
      fireEvent.press(
        within(screen.getByTestId(ownedSelector)).getByTestId(primarySelector),
      );
      await waitFor(() =>
        expect(cancelOrder).toHaveBeenCalledWith({
          orderId: activeChase.handle,
          symbol: 'ETH',
          orderType: 'chase',
        }),
      );
      expect(cancelOrder).toHaveBeenCalledTimes(1);
    },
  );

  itForPlatforms(
    'shows every loaded field for an active Chase row',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([activeChase]);
      renderFundedProMarket();

      await openChaseManagementTab();
      const row = await screen.findByTestId(
        getPerpsProChaseRowSelector('ETH', activeChase.handle, true),
      );

      const rowContent = within(row);
      expect(rowContent.getByText('ETH')).toBeOnTheScreen();
      expect(
        rowContent.getByText(strings('perps.market.long')),
      ).toBeOnTheScreen();
      expect(
        rowContent.getByText(strings('perps.order.chase.card.size')),
      ).toBeOnTheScreen();
      expect(rowContent.getByText('1 ETH')).toBeOnTheScreen();
      expect(
        rowContent.getByText(strings('perps.order.chase.card.filled_size')),
      ).toBeOnTheScreen();
      expect(rowContent.getByText('0 ETH')).toBeOnTheScreen();
      expect(
        rowContent.getByText(strings('perps.order.limit_price')),
      ).toBeOnTheScreen();
      expect(rowContent.getByText(/\$2,500\.1/u)).toBeOnTheScreen();
      expect(
        rowContent.queryByText(strings('perps.order.reduce_only')),
      ).not.toBeOnTheScreen();
      expect(
        rowContent.getByText(strings('perps.order.chase.card.distance_chased')),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(
          getPerpsProChaseDistanceSelector('ETH', activeChase.handle, true),
        ),
      ).toHaveTextContent('0.01% / 0.05% max');
      expect(rowContent.getByText('Running · 20%')).toBeOnTheScreen();
      expect(
        screen.getByTestId(
          getPerpsProChaseStatusSelector(
            'active',
            'ETH',
            activeChase.handle,
            true,
          ),
        ),
      ).toHaveProp('accessibilityLabel', 'Running · 20%');
      expect(
        screen.getByTestId(
          getPerpsProChaseTerminateSelector(
            'active',
            'ETH',
            activeChase.handle,
            true,
          ),
        ),
      ).toBeEnabled();
    },
  );

  itForPlatforms(
    'exposes the repriced limit value on the Chase key-value item',
    async () => {
      const repricedChase: ChaseOrder = {
        ...activeChase,
        handle: 'chase-view-repriced',
        repricings: 1,
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([repricedChase]);
      renderFundedProMarket();

      await openChaseManagementTab();

      expect(
        await screen.findByTestId(
          getPerpsProChaseRepriceSelector('ETH', repricedChase.handle, true),
        ),
      ).toHaveTextContent(/\$2,500\.1/u);
    },
  );

  itForPlatforms(
    'shows actual chased distance for an active Chase without a max distance',
    async () => {
      const unlimitedChase: ChaseOrder = {
        ...activeChase,
        handle: 'chase-view-unlimited',
        distanceChasedBps: 25,
        maxDistanceBps: undefined,
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([unlimitedChase]);
      renderFundedProMarket();

      await openChaseManagementTab();
      const row = await screen.findByTestId(
        getPerpsProChaseRowSelector('ETH', unlimitedChase.handle, true),
      );

      const rowContent = within(row);
      expect(
        rowContent.getByText(strings('perps.order.chase.card.distance_chased')),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(
          getPerpsProChaseDistanceSelector('ETH', unlimitedChase.handle, true),
        ),
      ).toHaveTextContent('0.25%');
      expect(
        rowContent.getByText(strings('perps.order.chase.running')),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'hides Chase selection when rollout is off and no session is retained',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([]);
      jest
        .mocked(Engine.context.PerpsController.getOrderCapabilities)
        .mockResolvedValue({
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['scale'],
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
                  perpsMobileScale: {
                    enabled: true,
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
      await findSizeInput();

      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.ADVANCED_TAB,
        ),
      );

      expect(
        screen.queryByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.CHASE_OPTION,
        ),
      ).not.toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsOrderTypeBottomSheetSelectorsIDs.SCALE_OPTION),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'keeps retained Chase lifecycle visible after rollout turns off',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([activeChase]);
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
                    enabled: false,
                    minimumVersion: '0.0.0',
                  },
                },
              },
            },
          },
        },
      });

      await openChaseManagementTab();

      expect(
        await screen.findByTestId(
          getPerpsProChaseRowSelector('ETH', activeChase.handle, true),
        ),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'shows canceled Chase without a terminate action',
    async () => {
      const canceledChase: ChaseOrder = {
        ...activeChase,
        status: 'canceled',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([canceledChase]);
      renderFundedProMarket();

      await openChaseManagementTab();
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );

      expect(
        await screen.findByTestId(
          getPerpsProChaseStatusSelector(
            'canceled',
            'ETH',
            canceledChase.handle,
            true,
          ),
        ),
      ).toHaveTextContent(strings('perps.order.chase.status.canceled'));
      expect(
        screen.queryByTestId(
          getPerpsProChaseTerminateSelector(
            'canceled',
            'ETH',
            canceledChase.handle,
            true,
          ),
        ),
      ).not.toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'shows backgrounded Chase in History without a terminate action',
    async () => {
      const backgroundedChase: ChaseOrder = {
        ...activeChase,
        status: 'backgrounded',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([backgroundedChase]);
      renderFundedProMarket();

      await openChaseManagementTab();
      expect(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_EMPTY_STATE),
      ).toHaveTextContent(strings('perps.order.chase.empty'));
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );

      expect(
        await screen.findByTestId(
          getPerpsProChaseStatusSelector(
            'backgrounded',
            'ETH',
            backgroundedChase.handle,
            true,
          ),
        ),
      ).toHaveTextContent(strings('perps.order.chase.status.backgrounded'));
      const row = screen.getByTestId(
        getPerpsProChaseRowSelector('ETH', backgroundedChase.handle, true),
      );
      expect(
        within(row).getByText(strings('perps.order.chase.card.max_distance')),
      ).toBeOnTheScreen();
      expect(within(row).getByText('0.05%')).toBeOnTheScreen();
      expect(
        screen.queryByTestId(
          getPerpsProChaseTerminateSelector(
            'backgrounded',
            'ETH',
            backgroundedChase.handle,
            true,
          ),
        ),
      ).not.toBeOnTheScreen();
    },
  );

  for (const status of [
    'duration_reached',
    'max_distance_reached',
    'repricing_limit_reached',
  ] as const) {
    itForPlatforms(
      `demotes ${status} Chase to History without a terminate action`,
      async () => {
        const terminalChase: ChaseOrder = {
          ...activeChase,
          status,
        };
        const getChaseOrders = jest.mocked(
          Engine.context.PerpsController.getChaseOrders,
        );
        getChaseOrders.mockResolvedValue([terminalChase]);
        renderFundedProMarket();

        await openChaseManagementTab();
        fireEvent.press(
          screen.getByTestId(
            PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE,
          ),
        );
        fireEvent.press(
          screen.getByTestId(
            `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
          ),
        );

        expect(
          await screen.findByTestId(
            getPerpsProChaseStatusSelector(
              status,
              'ETH',
              terminalChase.handle,
              true,
            ),
          ),
        ).toHaveTextContent(strings(`perps.order.chase.status.${status}`));
        expect(
          screen.queryByTestId(
            getPerpsProChaseTerminateSelector(
              status,
              'ETH',
              terminalChase.handle,
              true,
            ),
          ),
        ).not.toBeOnTheScreen();
      },
    );
  }

  itForPlatforms(
    'switches Chase between empty Active and filtered History states',
    async () => {
      const canceledChase: ChaseOrder = {
        ...activeChase,
        handle: 'chase-history-canceled',
        status: 'canceled',
      };
      const filledChase: ChaseOrder = {
        ...activeChase,
        handle: 'chase-history-filled',
        status: 'filled',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([canceledChase, filledChase]);
      renderFundedProMarket();

      await openChaseManagementTab();
      expect(
        screen.getByTestId(getPerpsProActivityViewSelector('active')),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_EMPTY_STATE),
      ).toHaveTextContent(strings('perps.order.chase.empty'));

      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );
      expect(
        await screen.findByText(strings('perps.order.chase.status.canceled')),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(strings('perps.order.chase.status.filled')),
      ).toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_FILLED_ONLY),
      );
      await waitFor(() => {
        expect(
          screen.queryByText(strings('perps.order.chase.status.canceled')),
        ).not.toBeOnTheScreen();
      });
      expect(
        screen.getByText(strings('perps.order.chase.status.filled')),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'renders an immediately filled Chase in History after placement and tab remount',
    async () => {
      const filledChase: ChaseOrder = {
        handle: 'chase-75dc4054-7c01-4bff-b31f-2a046c35ffdb',
        symbol: 'ETH',
        side: 'buy',
        originalSize: '0.3',
        remainingSize: '0',
        arrivalPrice: '2500',
        restingPrice: '2500',
        restingOrderId: null,
        distanceChasedBps: 0,
        maxDistanceBps: 122.05839273508447,
        repricings: 0,
        startedAt: 1_788_274_359_115,
        status: 'filled',
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const placeOrder = jest.mocked(Engine.context.PerpsController.placeOrder);
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
      getChaseOrders
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([filledChase]);
      placeOrder.mockResolvedValueOnce({
        success: true,
        orderId: filledChase.handle,
        childOrderIds: ['59067112481'],
        submittedSize: '0.3',
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
        ),
      );
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.CHASE_OPTION,
        ),
      );
      const placeOrderButton = screen.getByTestId(ids.PLACE_ORDER_BUTTON);
      await waitFor(() => expect(placeOrderButton).toBeEnabled(), {
        timeout: TIMEOUT_MS,
      });

      fireEvent.press(placeOrderButton);

      await waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(getChaseOrders).toHaveBeenCalledTimes(3));
      await openChaseManagementTab();
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );
      const rowSelector = getPerpsProChaseRowSelector(
        'ETH',
        filledChase.handle,
        true,
      );
      expect(await screen.findByTestId(rowSelector)).toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_FILLED_ONLY),
      );
      expect(await screen.findByTestId(rowSelector)).toBeOnTheScreen();
      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_POSITIONS,
        ),
      );
      await openChaseManagementTab();

      expect(await screen.findByTestId(rowSelector)).toBeOnTheScreen();
      expect(
        screen.getByText(strings('perps.order.chase.status.filled')),
      ).toBeOnTheScreen();
    },
  );

  itForPlatforms(
    'moves an omitted Active Chase to Filled History from child fill evidence',
    async () => {
      const runtimeActiveChase: ChaseOrder = {
        ...activeChase,
        handle: 'chase-4dbd96d9-1b85-4067-8b04-da01423b8e7a',
        originalSize: '0.31',
        remainingSize: '0.31',
        restingOrderId: '59081412404',
        startedAt: 1_788_278_727_454,
      };
      const runtimeChildOrder: Order = {
        orderId: '59081412404',
        symbol: 'ETH',
        side: 'buy',
        orderType: 'limit',
        size: '0.31',
        originalSize: '0.31',
        price: '2500',
        filledSize: '0.31',
        remainingSize: '0',
        status: 'filled',
        timestamp: 1_788_278_742_740,
        lastUpdated: 1_788_278_742_740,
      };
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const getOrders = jest.mocked(Engine.context.PerpsController.getOrders);
      getChaseOrders
        .mockResolvedValueOnce([runtimeActiveChase])
        .mockResolvedValue([]);
      getOrders.mockResolvedValue([runtimeChildOrder]);
      renderFundedProMarket();

      await openChaseManagementTab();
      const activeRowSelector = getPerpsProChaseRowSelector(
        'ETH',
        runtimeActiveChase.handle,
        true,
      );
      expect(await screen.findByTestId(activeRowSelector)).toBeOnTheScreen();
      act(() => PerpsCacheInvalidator.invalidate('accountState'));
      await waitFor(() => {
        expect(getChaseOrders).toHaveBeenCalledTimes(2);
        expect(screen.queryByTestId(activeRowSelector)).not.toBeOnTheScreen();
      });
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.ACTIVITY_VIEW_TOGGLE),
      );
      fireEvent.press(
        screen.getByTestId(
          `${PerpsProMarketViewSelectorsIDs.ACTIVITY_FILTER_SHEET}-option-${getPerpsProActivityViewSelector('history')}`,
        ),
      );
      const filledStatusSelector = getPerpsProChaseStatusSelector(
        'filled',
        'ETH',
        runtimeActiveChase.handle,
        true,
      );
      expect(await screen.findByTestId(filledStatusSelector)).toHaveTextContent(
        strings('perps.order.chase.status.filled'),
      );
      fireEvent.press(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_FILLED_ONLY),
      );
      expect(await screen.findByTestId(filledStatusSelector)).toBeOnTheScreen();

      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_POSITIONS,
        ),
      );
      await openChaseManagementTab();

      expect(await screen.findByTestId(filledStatusSelector)).toBeOnTheScreen();
    },
  );

  itForPlatforms('shows loading while a Chase cancel is pending', async () => {
    let resolveCancel:
      | ((value: { success: boolean; orderId: string }) => void)
      | undefined;
    const getChaseOrders = jest.mocked(
      Engine.context.PerpsController.getChaseOrders,
    );
    const cancelOrder = jest.mocked(Engine.context.PerpsController.cancelOrder);
    getChaseOrders.mockResolvedValue([activeChase]);
    cancelOrder.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve;
        }),
    );
    renderFundedProMarket();

    await openChaseManagementTab();
    const cancelButton = await screen.findByTestId(
      getPerpsProChaseTerminateSelector(
        'active',
        'ETH',
        activeChase.handle,
        true,
      ),
    );
    fireEvent.press(cancelButton);

    await waitFor(() => expect(cancelButton).toBeDisabled());
    await act(async () => {
      resolveCancel?.({ success: true, orderId: activeChase.handle });
      await Promise.resolve();
    });
  });

  itForPlatforms(
    'does not show failure after accepted Chase cancellation when refresh fails',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      const loggerError = jest
        .spyOn(Logger, 'error')
        .mockImplementation(() => undefined);
      getChaseOrders
        .mockResolvedValueOnce([activeChase])
        .mockRejectedValueOnce(new Error('refresh unavailable'));
      cancelOrder.mockClear();

      try {
        renderFundedProMarket();
        await openChaseManagementTab();
        fireEvent.press(
          screen.getByTestId(
            getPerpsProChaseTerminateSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        );

        await waitFor(() => {
          expect(cancelOrder).toHaveBeenCalledTimes(1);
          expect(loggerError).toHaveBeenCalled();
        });
        expect(
          screen.getByTestId(
            getPerpsProChaseStatusSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        ).toBeOnTheScreen();
        expect(
          screen.queryByText(strings('perps.order.failed_to_cancel_order')),
        ).not.toBeOnTheScreen();
      } finally {
        loggerError.mockRestore();
      }
    },
  );

  itForPlatforms(
    'reports an unexpected controller refresh failure after Chase cancellation',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      const cancelOrder = jest.mocked(
        Engine.context.PerpsController.cancelOrder,
      );
      const loggerError = jest
        .spyOn(Logger, 'error')
        .mockImplementation(() => undefined);
      getChaseOrders
        .mockResolvedValueOnce([activeChase])
        .mockRejectedValueOnce(new Error('refresh failed'));
      cancelOrder.mockClear();

      try {
        renderFundedProMarket();
        await openChaseManagementTab();
        loggerError.mockClear();
        fireEvent.press(
          screen.getByTestId(
            getPerpsProChaseTerminateSelector(
              'active',
              'ETH',
              activeChase.handle,
              true,
            ),
          ),
        );

        await waitFor(() => {
          expect(cancelOrder).toHaveBeenCalledTimes(1);
          expect(loggerError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({
              context: expect.objectContaining({
                name: 'PerpsProPositionsPanel.refreshAfterTerminateChase',
              }),
            }),
          );
        });
      } finally {
        loggerError.mockRestore();
      }
    },
  );

  itForPlatforms('keeps the Chase side filter local to the panel', async () => {
    const getChaseOrders = jest.mocked(
      Engine.context.PerpsController.getChaseOrders,
    );
    const shortChase = {
      ...activeChase,
      handle: 'chase-view-short',
      symbol: 'BTC',
      side: 'sell' as const,
    };
    getChaseOrders.mockResolvedValue([activeChase, shortChase]);
    renderFundedProMarket();

    await openChaseManagementTab();
    fireEvent.press(
      screen.getByTestId(
        PerpsProMarketViewSelectorsIDs.CHASE_SIDE_FILTER_BUTTON,
      ),
    );
    fireEvent.press(
      await screen.findByTestId(
        getPerpsProChaseSideFilterOptionSelector('short'),
      ),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId(
          getPerpsProChaseRowSelector('ETH', activeChase.handle, true),
        ),
      ).not.toBeOnTheScreen();
    });
    expect(
      screen.getByTestId(
        getPerpsProChaseRowSelector('BTC', shortChase.handle, true),
      ),
    ).toBeOnTheScreen();
    fireEvent.press(
      screen.getByTestId(
        PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_ORDERS,
      ),
    );

    expect(
      screen.getByTestId(
        PerpsProMarketViewSelectorsIDs.POSITIONS_SIDE_FILTER_BUTTON,
      ),
    ).toHaveTextContent(
      strings('perps.pro_positions_panel.side_filter.all_sides'),
    );
  });

  itForPlatforms(
    'shows Chase side-filter copy when no rows match',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([activeChase]);
      renderFundedProMarket();
      await openChaseManagementTab();

      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.CHASE_SIDE_FILTER_BUTTON,
        ),
      );
      fireEvent.press(
        await screen.findByTestId(
          getPerpsProChaseSideFilterOptionSelector('short'),
        ),
      );

      expect(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_EMPTY_STATE),
      ).toHaveTextContent(strings('perps.order.chase.empty_short'));
    },
  );

  itForPlatforms(
    'shows Chase ticker-filter copy when no rows match',
    async () => {
      const getChaseOrders = jest.mocked(
        Engine.context.PerpsController.getChaseOrders,
      );
      getChaseOrders.mockResolvedValue([
        { ...activeChase, handle: 'chase-btc', symbol: 'BTC' },
      ]);
      renderFundedProMarket();

      await openChaseManagementTab();
      fireEvent.press(
        screen.getByTestId(
          PerpsProMarketViewSelectorsIDs.POSITIONS_TICKER_ONLY,
        ),
      );

      expect(
        screen.getByTestId(PerpsProMarketViewSelectorsIDs.CHASE_EMPTY_STATE),
      ).toHaveTextContent(
        strings('perps.order.chase.empty_filtered', { ticker: 'ETH' }),
      );
      const chaseTab = screen.getByTestId(
        PerpsProMarketViewSelectorsIDs.POSITIONS_PANEL_TAB_CHASE,
      );
      const chaseTabLabels = within(chaseTab).getAllByText(
        strings('perps.order.chase.tab'),
      );
      chaseTabLabels.forEach((label) => expect(label).toBeOnTheScreen());
    },
  );

  itForPlatforms(
    'supports size backspace and retype, then removes limit-price leading zeros',
    async () => {
      renderFundedProMarket();
      const sizeInput = await findSizeInput();

      fireEvent(sizeInput, 'focus');
      fireEvent.changeText(sizeInput, '1');
      await waitFor(() => expect(sizeInput).toHaveProp('value', '1'));
      fireEvent.changeText(sizeInput, '');
      await waitFor(() => expect(sizeInput).toHaveProp('value', ''));
      fireEvent.changeText(sizeInput, '2');

      await waitFor(() => expect(sizeInput).toHaveProp('value', '2'));
      fireEvent.press(screen.getByTestId(ids.ORDER_TYPE_BUTTON));
      fireEvent.press(
        await screen.findByTestId(
          PerpsOrderTypeBottomSheetSelectorsIDs.LIMIT_OPTION,
          {},
          { timeout: TIMEOUT_MS },
        ),
      );
      const limitPriceInput = await findPriceInput(ids.LIMIT_PRICE_INPUT);
      fireEvent.changeText(limitPriceInput, '00025');

      await waitFor(() => expect(limitPriceInput).toHaveProp('value', '25'));
    },
  );
});
