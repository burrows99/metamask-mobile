import BN from 'bnjs4';

import { renderHookWithProvider } from '../../../../../util/test/renderWithProvider';
import { evmSendStateMock, SOLANA_ASSET } from '../../__mocks__/send.mock';
import { useSendContext } from '../../context/send-context';
import { usePercentageAmount } from './usePercentageAmount';
import { useBalance } from './useBalance';
import { useParams } from '../../../../../util/navigation/navUtils';
// eslint-disable-next-line import-x/no-namespace
import * as TronSnap from '../../../../../core/Multichain/tron';

const NATIVE_ASSET = {
  chainId: '0x1',
  address: '0xeDd1935e28b253C7905Cf5a944f0B5830FFA916a',
  decimals: 2,
  isNative: true,
};

const TRON_ACCOUNT = {
  id: 'tron-account-id',
  address: 'TK3xRFq22eEiATz6kfamDeAAQrPdfdGPeq',
  metadata: { snap: { id: 'npm:@metamask/tron-wallet-snap' } },
};

const TRON_ASSET = {
  assetId: 'tron:728126428/slip44:195',
  chainId: 'tron:728126428',
  address: 'TK3xRFq22eEiATz6kfamDeAAQrPdfdGPeq',
  decimals: 6,
  isNative: true,
  symbol: 'TRX',
};

const TRC20_ASSET = {
  assetId: 'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  chainId: 'tron:728126428',
  address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  decimals: 6,
  isNative: false,
  symbol: 'USDT',
};

jest.mock('@metamask/assets-controllers', () => ({
  getNativeTokenAddress: () => '0xeDd1935e28b253C7905Cf5a944f0B5830FFA916a',
}));

jest.mock('../../context/send-context', () => ({
  useSendContext: jest.fn(),
}));

jest.mock('./useBalance', () => ({
  useBalance: jest.fn(),
}));

jest.mock('../../../../../util/navigation/navUtils', () => ({
  useParams: jest.fn(),
}));

jest.mock('../../../../../core/Multichain/tron', () => ({
  getTronMaxSendableAmount: jest.fn(),
}));

const mockState = {
  state: evmSendStateMock,
};

const mockUseSendContext = jest.mocked(useSendContext);
const mockUseBalance = jest.mocked(useBalance);
const mockUseParams = jest.mocked(useParams);

const setBalance = (rawBalance: string, decimals = 2) => {
  mockUseBalance.mockReturnValue({
    balance: rawBalance,
    decimals,
    rawBalanceBN: new BN(rawBalance),
  });
};

describe('usePercentageAmount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue(undefined);
  });

  it('returns the percentage of the balance for a token', () => {
    mockUseSendContext.mockReturnValue({
      asset: { chainId: '0x1', decimals: 2 },
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('1000');

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.isMaxAmountSupported).toBe(true);
    expect(result.current.getPercentageAmount(100)).toBe('10');
    expect(result.current.getPercentageAmount(75)).toBe('7.5');
    expect(result.current.getPercentageAmount(25)).toBe('2.5');
  });

  it('returns the full balance as Max for an EVM native asset', () => {
    mockUseSendContext.mockReturnValue({
      asset: NATIVE_ASSET,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('1000000000000000');

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.isMaxAmountSupported).toBe(true);
    expect(result.current.getPercentageAmount(100)).toBe('10000000000000');
    expect(result.current.getPercentageAmount(50)).toBe('5000000000000');
  });

  it('returns zero for an empty balance', () => {
    mockUseSendContext.mockReturnValue({
      asset: NATIVE_ASSET,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('0');

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.getPercentageAmount(100)).toBe('0');
  });

  it('returns zero without an asset', () => {
    mockUseSendContext.mockReturnValue({
      asset: undefined,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('1000');

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.getPercentageAmount(100)).toBe('0');
  });

  it('does not support Max for a non-EVM native asset', () => {
    mockUseSendContext.mockReturnValue({
      asset: SOLANA_ASSET,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('10', 0);

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.isMaxAmountSupported).toBe(false);
    expect(result.current.getPercentageAmount(75)).toBe('0.000000000000000007');
    expect(result.current.getPercentageAmount(100)).toBeUndefined();
  });

  it('supports Max for a native Tron asset and quotes it from the Snap', async () => {
    const getTronMaxSendableAmountMock = jest
      .spyOn(TronSnap, 'getTronMaxSendableAmount')
      .mockResolvedValue({ amount: '9.5' });
    mockUseSendContext.mockReturnValue({
      asset: TRON_ASSET,
      fromAccount: TRON_ACCOUNT,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('10000000', 6);

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    expect(result.current.isMaxAmountSupported).toBe(true);
    await expect(result.current.getMaxAmount()).resolves.toBe('9.5');
    expect(getTronMaxSendableAmountMock).toHaveBeenCalledWith(TRON_ACCOUNT, {
      accountId: TRON_ACCOUNT.id,
      assetId: TRON_ASSET.assetId,
    });
  });

  it('reserves 1.1 TRX when the Snap cannot quote a native Tron maximum', async () => {
    jest
      .spyOn(TronSnap, 'getTronMaxSendableAmount')
      .mockRejectedValue(new Error('Snap unavailable'));
    mockUseSendContext.mockReturnValue({
      asset: TRON_ASSET,
      fromAccount: TRON_ACCOUNT,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('10000000', 6);

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    await expect(result.current.getMaxAmount()).resolves.toBe('8.9');
  });

  it('returns zero when the native Tron balance cannot cover the fallback reserve', async () => {
    jest
      .spyOn(TronSnap, 'getTronMaxSendableAmount')
      .mockRejectedValue(new Error('Snap unavailable'));
    mockUseSendContext.mockReturnValue({
      asset: TRON_ASSET,
      fromAccount: TRON_ACCOUNT,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('1000000', 6);

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    await expect(result.current.getMaxAmount()).resolves.toBe('0');
  });

  it('falls back to the token balance when the Snap cannot quote a TRC-20 maximum', async () => {
    jest
      .spyOn(TronSnap, 'getTronMaxSendableAmount')
      .mockRejectedValue(new Error('Snap unavailable'));
    mockUseSendContext.mockReturnValue({
      asset: TRC20_ASSET,
      fromAccount: TRON_ACCOUNT,
    } as unknown as ReturnType<typeof useSendContext>);
    setBalance('10000000', 6);

    const { result } = renderHookWithProvider(
      () => usePercentageAmount(),
      mockState,
    );

    await expect(result.current.getMaxAmount()).resolves.toBe('10');
  });
});
