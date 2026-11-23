import { configureStore } from '@reduxjs/toolkit';
import { useNavigation } from '@react-navigation/native';
import useEmailVerificationSend from '../../hooks/useEmailVerificationSend';
import { useDebouncedValue } from '../../../../hooks/useDebouncedValue';
import { validateEmail } from '../../../Ramp/utils/depositUtils';
import { validatePassword } from '../../util/validatePassword';
import SignUp from './SignUp';
import Routes from '../../../../../constants/navigation/Routes';
import { MONEY_HOME_CARD_ORIGIN } from '../../hooks/useCardPostAuthRedirect';
import { useAnalytics } from '../../../../hooks/useAnalytics/useAnalytics';
import { AnalyticsEventBuilder } from '../../../../../util/analytics/AnalyticsEventBuilder';
import { createMockUseAnalyticsHook } from '../../../../../util/test/analyticsMock';

export const mockUseCardPostAuthRedirect = jest.fn();
export const mockTrackEvent = jest.fn();

jest.mock('../../hooks/useCardPostAuthRedirect', () => ({
  useCardPostAuthRedirect: () => mockUseCardPostAuthRedirect(),
  MONEY_HOME_CARD_ORIGIN: {
    screen: 'Money',
    params: { screen: 'MoneyHome' },
  },
}));

jest.mock('../../../../hooks/useAnalytics/useAnalytics');

// Capture setOnValueChange so tests can simulate country picks from the modal.
export let capturedOnValueChange:
  | ((region: {
      key: string;
      name: string;
      emoji?: string;
      areaCode?: string;
      canSignUp?: boolean;
    }) => void)
  | null = null;
jest.mock('./RegionSelectorModal', () => ({
  setOnValueChange: jest.fn((cb) => {
    capturedOnValueChange = cb;
  }),
  clearOnValueChange: jest.fn(),
  createRegionSelectorModalNavigationDetails: (params: unknown) => [
    'RegionSelectorModal',
    { params },
  ],
}));

export const mockRefetchLegalDocs = jest.fn();
export const mockUseImmersveSupportedRegions = jest.fn(
  (
    _regionCode?: string | null,
    _options?: { enabled?: boolean },
  ): {
    region: null;
    onboardingDocuments: {
      id: string;
      title: string;
      url: string;
    }[];
    permanentDocuments: never[];
    isLoading: boolean;
    error: Error | null;
    refetch: jest.Mock;
  } => ({
    region: null,
    onboardingDocuments: [
      {
        id: 'generalTermsOfUse',
        title: 'Terms of Use',
        url: 'https://example.com/terms',
      },
      {
        id: 'privacyPolicy',
        title: 'Privacy Policy',
        url: 'https://example.com/privacy',
      },
    ],
    permanentDocuments: [],
    isLoading: false,
    error: null,
    refetch: mockRefetchLegalDocs,
  }),
);

jest.mock('../../hooks/useImmersveSupportedRegions', () => ({
  __esModule: true,
  default: (...args: unknown[]) =>
    (
      mockUseImmersveSupportedRegions as unknown as (...a: unknown[]) => unknown
    )(...args),
}));

// Mock navigation
export const mockUseRoute = jest.fn<
  { params: { fromMigration?: boolean } | undefined },
  []
>(() => ({ params: undefined }));
// The PredictNext entry point's PredictRoot loads the whole Predict stack,
// which this suite's navigation mocks cannot satisfy.
jest.mock('../../../PredictNext/navigation/root/PredictRoot', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: () => mockUseRoute(),
}));

export const mockUseNavigation = useNavigation as jest.MockedFunction<
  typeof useNavigation
>;

// Mock i18n
jest.mock('../../../../../../locales/i18n', () => ({
  strings: (key: string) => key,
}));

// Mock hooks
jest.mock('../../hooks/useEmailVerificationSend', () => ({
  __esModule: true,
  default: jest.fn(),
}));
export const mockSignUpRegions = [
  {
    key: 'US',
    name: 'United States',
    emoji: '🇺🇸',
    areaCode: '1',
    canSignUp: true,
  },
  {
    key: 'CA',
    name: 'Canada',
    emoji: '🇨🇦',
    areaCode: '1',
    canSignUp: true,
  },
  {
    key: 'GB',
    name: 'United Kingdom',
    emoji: '🇬🇧',
    areaCode: '44',
    canSignUp: false,
  },
  {
    key: 'DE',
    name: 'Germany',
    emoji: '🇩🇪',
    areaCode: '49',
    canSignUp: true,
  },
];
export const mockGetRegionByCode = (code: string) =>
  mockSignUpRegions.find((r) => r.key === code) ?? null;
jest.mock('../../hooks/useRegions', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    allRegions: mockSignUpRegions,
    signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
    getRegionByCode: mockGetRegionByCode,
    isLoading: false,
    isRegistrationSettingsFetched: true,
  })),
}));
jest.mock('../../../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: jest.fn(),
}));

export let mockIsMoneyAccountCountry = false;
export const setMockIsMoneyAccountCountry = (value: boolean) => {
  mockIsMoneyAccountCountry = value;
};
jest.mock('../../hooks/useImmersveFundingChannel', () => ({
  useIsImmersveMoneyAccountCountry: () => mockIsMoneyAccountCountry,
  useImmersveFundingChannel: () => null,
}));

// Mock only the version-gated Immersve flag selector (avoids the real device-info
// version gate); keep the rest of the card selectors actual.
jest.mock('../../../../../selectors/moneyAccountController', () => {
  const actual = jest.requireActual(
    '../../../../../selectors/moneyAccountController',
  );
  return {
    ...actual,
    selectPrimaryMoneyAccount: jest.fn(() => null),
  };
});

jest.mock('../../../../../selectors/featureFlagController/card', () => {
  const actual = jest.requireActual(
    '../../../../../selectors/featureFlagController/card',
  );
  return {
    ...actual,
    selectCardImmersveCountries: jest.fn(() => ['GB']),
    selectCardImmersveEnabled: jest.fn(() => false),
  };
});

jest.mock('../../hooks/useCardUkMigrationState', () => ({
  useCardUkMigrationState: jest.fn(() => ({
    state: {
      phase: 'soft',
      isActive: true,
      deadline: new Date('2026-09-30T23:59:59.999Z'),
    },
    refresh: jest.fn(),
  })),
}));

jest.mock('../../hooks/useCardUkMigrationUpdateBadge', () => ({
  useCardUkMigrationUpdateBadge: jest.fn(() => 'warning'),
}));

// Mock utility functions
jest.mock('../../../Ramp/utils/depositUtils', () => ({
  validateEmail: jest.fn(),
  getNotificationDetails: jest.fn(),
  hasDepositOrderField: jest.fn(),
  generateThemeParameters: jest.fn(),
  generateWidgetThemeParameters: jest.fn(),
  timestampToTransakFormat: jest.fn(),
  excludeFromArray: jest.fn(),
}));
jest.mock('../../util/validatePassword', () => ({
  validatePassword: jest.fn(),
}));

// The barrel also exports the AccountSelector screen, whose import graph is
// most of the app; SignUp only uses the navigation details helper.
jest.mock('../../../../Views/AccountSelector', () => {
  const { createNavigationDetails } = jest.requireActual(
    '../../../../../util/navigation/navUtils',
  );
  const { default: MockRoutes } = jest.requireActual(
    '../../../../../constants/navigation/Routes',
  );
  return {
    createAccountSelectorNavDetails: createNavigationDetails(
      MockRoutes.MULTICHAIN_ACCOUNTS.ACCOUNT_SELECTOR,
    ),
  };
});

// Mock Engine
export const mockSetUserLocation = jest.fn();
export const mockSetSelectedCountry = jest.fn();
export const mockLogout = jest.fn();
export const mockBeginMigration = jest.fn();
export const mockCancelMigration = jest.fn();
export const mockRequestLegacyAccountClosure = jest.fn();
export const mockGetUserDetails = jest.fn();
export const mockCreateFundingSource = jest.fn();
export const mockGetFundingSources = jest.fn();
export const mockGetResumeCardInfo = jest.fn();
export const mockGetSpendingPrerequisites = jest.fn();
export const mockPatchContactDetails = jest.fn();
export const mockRecordProviderOnboardingStarted = jest.fn();
export const mockRecordCardActivated = jest.fn();
jest.mock('../../../../../core/Engine', () => ({
  context: {
    CardController: {
      setUserLocation: (...args: unknown[]) => mockSetUserLocation(...args),
      setSelectedCountry: (...args: unknown[]) =>
        mockSetSelectedCountry(...args),
      logout: (...args: unknown[]) => mockLogout(...args),
      beginMigration: (...args: unknown[]) => mockBeginMigration(...args),
      cancelMigration: (...args: unknown[]) => mockCancelMigration(...args),
      requestLegacyAccountClosure: (...args: unknown[]) =>
        mockRequestLegacyAccountClosure(...args),
      getUserDetails: (...args: unknown[]) => mockGetUserDetails(...args),
      createFundingSource: (...args: unknown[]) =>
        mockCreateFundingSource(...args),
      getFundingSources: (...args: unknown[]) => mockGetFundingSources(...args),
      getResumeCardInfo: (...args: unknown[]) => mockGetResumeCardInfo(...args),
      getSpendingPrerequisites: (...args: unknown[]) =>
        mockGetSpendingPrerequisites(...args),
      patchContactDetails: (...args: unknown[]) =>
        mockPatchContactDetails(...args),
      recordProviderOnboardingStarted: (...args: unknown[]) =>
        mockRecordProviderOnboardingStarted(...args),
      recordCardActivated: (...args: unknown[]) =>
        mockRecordCardActivated(...args),
    },
  },
}));

// Resume/routing details are covered in useImmersveResumeOnboarding.test.ts;
// here we assert SignUp wires continue → resume → router.
export const mockRouteImmersve = jest.fn();
jest.mock('../../hooks/useImmersveOnboardingRouter', () => ({
  useImmersveOnboardingRouter: () => mockRouteImmersve,
}));

// Immersve onboarding-entry mocks (SIWE + selected-account binding)
export const mockImmersveSignIn = jest.fn();
jest.mock('../../hooks/useImmersveSiweAuth', () => ({
  useImmersveSiweAuth: () => ({
    signIn: mockImmersveSignIn,
    isAuthenticating: false,
    error: null,
  }),
}));
export const IMMERSVE_TEST_ADDRESS =
  '0x1234567890123456789012345678901234567890';
export let mockAccountGroupName: string | null = 'Account 1';
export let mockSelectedImmersveAccount: { address: string } | null = {
  address: IMMERSVE_TEST_ADDRESS,
};
export const setMockImmersveAccount = (
  groupName: string | null,
  account: { address: string } | null,
) => {
  mockAccountGroupName = groupName;
  mockSelectedImmersveAccount = account;
};
jest.mock('../../../../hooks/multichainAccounts/useAccountGroupName', () => ({
  useAccountGroupName: () => mockAccountGroupName,
}));
jest.mock('../../../../../selectors/multichainAccounts/accounts', () => ({
  selectSelectedInternalAccountByScope: () => () => mockSelectedImmersveAccount,
}));

// Mock OnboardingStep
jest.mock('./OnboardingStep', () => {
  const { mockRenderFooterButtons } = jest.requireActual(
    './testUtils/mockOnboardingStepFooter',
  );
  const ReactActual = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return (props: {
    title?: unknown;
    description?: unknown;
    formFields?: unknown;
    primaryButtonProps?: Record<string, unknown>;
    secondaryButtonProps?: Record<string, unknown>;
    tertiaryButtonProps?: Record<string, unknown>;
  }) =>
    ReactActual.createElement(
      View,
      { testID: 'onboarding-step' },
      ReactActual.createElement(
        View,
        { testID: 'onboarding-step-title' },
        props.title,
      ),
      ReactActual.createElement(
        View,
        { testID: 'onboarding-step-description' },
        props.description,
      ),
      ReactActual.createElement(
        View,
        { testID: 'onboarding-step-form-fields' },
        props.formFields,
      ),
      ReactActual.createElement(
        View,
        { testID: 'onboarding-step-actions' },
        mockRenderFooterButtons(props),
      ),
    );
});

// Create test store
// SignUp reads geoLocation from state.engine.backgroundState.GeolocationController.
// Pass { geoLocation: 'US', geoStatus: 'loading' } to control it. A location
// without a status is treated as a completed lookup.
export const createTestStore = (initialState: Record<string, unknown> = {}) => {
  const { geoLocation, geoStatus, ...cardState } = initialState;
  const hasGeoLocation = typeof geoLocation === 'string';
  const hasGeoStatus = typeof geoStatus === 'string';
  const engineState = {
    backgroundState: {
      GeolocationController:
        hasGeoLocation || hasGeoStatus
          ? {
              ...(hasGeoLocation ? { location: geoLocation } : {}),
              ...(hasGeoStatus
                ? { status: geoStatus }
                : { status: 'complete' }),
            }
          : undefined,
      CardController: {
        selectedCountry: null,
        activeProviderId: 'baanx',
        isAuthenticated: false,
        providerData: {},
        cardHomeData: null,
        cardHomeDataStatus: 'idle',
        moneyAccountCardLinkInProgress: false,
        lastUnauthenticatedReason: null,
      },
    },
  };

  return configureStore({
    reducer: {
      engine: (
        state: typeof engineState = engineState,
        action: { type: string; payload?: unknown } = { type: '' },
      ) => {
        if (action.type === 'test/set-geolocation') {
          return {
            ...state,
            backgroundState: {
              ...state.backgroundState,
              GeolocationController:
                action.payload as typeof engineState.backgroundState.GeolocationController,
            },
          };
        }
        return state;
      },
      card: (
        state = {
          onboarding: {
            selectedCountry: null,
            onboardingId: null,
            contactVerificationId: null,
            user: null,
          },
          ...cardState,
        },
        action = { type: '', payload: null },
      ) => {
        switch (action.type) {
          default:
            return state;
        }
      },
      settings: () => ({
        avatarAccountType: 'Maskicon',
      }),
    },
  });
};

export function setupSignUpMocks() {
  jest.clearAllMocks();
  mockIsMoneyAccountCountry = false;
  mockAccountGroupName = 'Account 1';
  mockSelectedImmersveAccount = { address: IMMERSVE_TEST_ADDRESS };
  const { selectPrimaryMoneyAccount } = jest.requireMock(
    '../../../../../selectors/moneyAccountController',
  );
  selectPrimaryMoneyAccount.mockReset();
  selectPrimaryMoneyAccount.mockImplementation(() => null);
  mockRecordProviderOnboardingStarted.mockResolvedValue(undefined);
  mockRecordCardActivated.mockResolvedValue(undefined);
  capturedOnValueChange = null;
  mockUseRoute.mockReturnValue({ params: undefined });
  mockGetUserDetails.mockReset();
  mockGetUserDetails.mockResolvedValue({});
  mockLogout.mockResolvedValue(undefined);
  mockRequestLegacyAccountClosure.mockResolvedValue(undefined);
  mockUseCardPostAuthRedirect.mockReturnValue(undefined);
  mockUseImmersveSupportedRegions.mockReturnValue({
    region: null,
    onboardingDocuments: [
      {
        id: 'generalTermsOfUse',
        title: 'Terms of Use',
        url: 'https://example.com/terms',
      },
      {
        id: 'privacyPolicy',
        title: 'Privacy Policy',
        url: 'https://example.com/privacy',
      },
    ],
    permanentDocuments: [],
    isLoading: false,
    error: null,
    refetch: mockRefetchLegalDocs,
  });
  mockRefetchLegalDocs.mockResolvedValue(null);
  const mockNavigate = jest.fn();
  const mockGoBack = jest.fn();
  mockUseNavigation.mockReturnValue({
    navigate: mockNavigate,
    goBack: mockGoBack,
  } as unknown as ReturnType<typeof useNavigation>);
  const mockSendEmailVerification = jest
    .fn()
    .mockResolvedValue({ contactVerificationId: '123' });
  (useEmailVerificationSend as jest.Mock).mockReturnValue({
    sendEmailVerification: mockSendEmailVerification,
    isLoading: false,
    isError: false,
    error: null,
    reset: jest.fn(),
  });
  (useDebouncedValue as jest.Mock).mockImplementation((value) => value);
  (validateEmail as jest.Mock).mockReturnValue(true);
  (validatePassword as jest.Mock).mockReturnValue(true);
  const cardFlagSelectors = jest.requireMock(
    '../../../../../selectors/featureFlagController/card',
  );
  (cardFlagSelectors.selectCardImmersveEnabled as jest.Mock).mockReturnValue(
    false,
  );
  (cardFlagSelectors.selectCardImmersveCountries as jest.Mock).mockReturnValue([
    'GB',
  ]);
  mockGetResumeCardInfo.mockResolvedValue(null);
  const store = createTestStore();
  jest.mocked(useAnalytics).mockReturnValue(
    createMockUseAnalyticsHook({
      trackEvent: mockTrackEvent,
      createEventBuilder: AnalyticsEventBuilder.createEventBuilder,
    }),
  );
  return { store, mockSendEmailVerification, mockNavigate, mockGoBack };
}
