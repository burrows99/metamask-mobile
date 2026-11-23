import BN from 'bnjs4';
import { useCallback } from 'react';
import { CaipAssetType } from '@metamask/utils';

import { isTronAddress } from '../../../../../core/Multichain/utils';
import { getTronMaxSendableAmount } from '../../../../../core/Multichain/tron';
import { AssetType } from '../../types/token';
import { fromBNWithDecimals } from '../../utils/send';
import { useSendContext } from '../../context/send-context';
import { useBalance } from './useBalance';
import { useSendType } from './useSendType';

/**
 * Returns a percentage of the balance.
 *
 * Max returns the full balance, except for Tron where the Snap quotes the
 * maximum that still leaves room for the fees (and the account activation
 * reserve when the recipient is unknown). If the Snap cannot quote a maximum,
 * native TRX reserves the worst-case fee while TRC-20 falls back to the token
 * balance. For native EVM sends, the gas fee is subtracted on the confirmation
 * by `useMaxValueRefresher`, using the gas estimated by `TransactionController`.
 *
 * @param args - The calculation arguments.
 * @param args.asset - The asset being sent.
 * @param args.percentage - The percentage of the balance, from 0 to 100.
 * @param args.rawBalanceBN - The balance, in minimal units.
 * @returns The amount, in decimal units of the asset.
 */
export const getPercentageValueFn = ({
  asset,
  percentage,
  rawBalanceBN,
}: {
  asset?: AssetType;
  percentage: number;
  rawBalanceBN: BN;
}) => {
  if (!asset) {
    return '0';
  }

  const percentageValue = rawBalanceBN.mul(new BN(percentage)).div(new BN(100));

  return fromBNWithDecimals(percentageValue, asset.decimals);
};

const getTronNativeFallbackMax = (asset: AssetType, rawBalanceBN: BN) => {
  // Worst-case native TRX fee, used when the Snap cannot quote a maximum.
  const reserve = new BN('11')
    .mul(new BN(10).pow(new BN(asset.decimals)))
    .div(new BN(10));
  const maxValue = rawBalanceBN.sub(reserve);

  return maxValue.isNeg() ? '0' : fromBNWithDecimals(maxValue, asset.decimals);
};

export const usePercentageAmount = () => {
  const { asset, fromAccount, to } = useSendContext();
  const { isNonEvmNativeSendType, isTronSendType } = useSendType();
  const { rawBalanceBN } = useBalance();

  const getPercentageAmount = useCallback(
    (percentage: number) => {
      if (isNonEvmNativeSendType && percentage === 100) return undefined;
      return getPercentageValueFn({
        asset: asset as AssetType,
        percentage,
        rawBalanceBN,
      });
    },
    [asset, isNonEvmNativeSendType, rawBalanceBN],
  );

  const getMaxAmount = useCallback(async () => {
    if (isTronSendType && asset && fromAccount) {
      try {
        const { amount } = await getTronMaxSendableAmount(fromAccount, {
          accountId: fromAccount.id,
          assetId: (asset as AssetType).assetId as CaipAssetType,
          ...(to && isTronAddress(to) ? { toAddress: to } : {}),
        });
        return amount;
      } catch {
        const tronAsset = asset as AssetType;
        if (tronAsset.isNative) {
          return getTronNativeFallbackMax(tronAsset, rawBalanceBN);
        }
      }
    }

    return getPercentageValueFn({
      asset: asset as AssetType,
      percentage: 100,
      rawBalanceBN,
    });
  }, [asset, fromAccount, isTronSendType, rawBalanceBN, to]);

  return {
    getPercentageAmount,
    getMaxAmount,
    isMaxAmountSupported: !isNonEvmNativeSendType || Boolean(isTronSendType),
  };
};
