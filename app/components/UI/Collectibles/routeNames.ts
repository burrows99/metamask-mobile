export const collectiblesRoutes = {
  root: 'Collectibles',
  home: 'CollectiblesHome',
  buySheet: 'CollectiblesBuySheet',
} as const;

export interface BuySheetParams {
  packCode: string;
}

export type CollectiblesParamList = ReactNavigation.RootParamList &
  Record<typeof collectiblesRoutes.root, undefined> &
  Record<typeof collectiblesRoutes.buySheet, BuySheetParams>;
