import {
  IMMERSVE_TEST_ADDRESS,
  capturedOnValueChange,
  createTestStore,
  mockBeginMigration,
  mockCancelMigration,
  mockCreateFundingSource,
  mockGetFundingSources,
  mockGetRegionByCode,
  mockGetSpendingPrerequisites,
  mockGetUserDetails,
  mockImmersveSignIn,
  mockLogout,
  mockPatchContactDetails,
  mockRefetchLegalDocs,
  mockRequestLegacyAccountClosure,
  mockRouteImmersve,
  mockSetSelectedCountry,
  mockSetUserLocation,
  mockSignUpRegions,
  mockTrackEvent,
  mockUseImmersveSupportedRegions,
  mockUseRoute,
  setMockImmersveAccount,
  setMockIsMoneyAccountCountry,
  setupSignUpMocks,
} from './SignUp.testUtils';
import { Keyboard } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import SignUp from './SignUp';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import { CardActions, CardFlow, CardScreens } from '../../util/metrics';
import en from '../../../../../../locales/languages/en.json';

describe('SignUp Component', () => {
  let store: ReturnType<typeof createTestStore>;
  let mockNavigate: jest.Mock;

  beforeEach(() => {
    ({ store, mockNavigate } = setupSignUpMocks());
  });

  describe('Country Selection', () => {
    it('renders country select touchable', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const countrySelect = getByTestId('signup-country-select');
      expect(countrySelect).toBeTruthy();
    });

    it('navigates to region selector modal on press', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const countrySelect = getByTestId('signup-country-select');
      fireEvent.press(countrySelect);

      expect(mockNavigate).toHaveBeenCalled();
    });

    it('prefills country when geoLocation matches a supported country', () => {
      const storeWithGeo = createTestStore({ geoLocation: 'CA' });

      const { getByText } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(getByText('Canada', { exact: false })).toBeOnTheScreen();
      expect(mockSetUserLocation).toHaveBeenCalledWith('international');
    });

    it('prefills country and sets US location when geoLocation is US', () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockSetUserLocation).toHaveBeenCalledWith('us');
    });

    it('prefills the US country from a subdivision geolocation', () => {
      const { getByText } = render(
        <Provider store={createTestStore({ geoLocation: 'US-NY' })}>
          <SignUp />
        </Provider>,
      );

      expect(getByText('United States', { exact: false })).toBeOnTheScreen();
      expect(mockSetUserLocation).toHaveBeenCalledWith('us');
      expect(mockSetSelectedCountry).toHaveBeenCalledWith('US');
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: MetaMetricsEvents.CARD_VIEWED.category,
          properties: expect.objectContaining({
            country_prefill_status: 'prefilled',
            location_format: 'subdivision',
          }),
        }),
      );
    });

    it('prefills the Canada country from a subdivision geolocation', () => {
      const { getByText } = render(
        <Provider store={createTestStore({ geoLocation: 'CA-ON' })}>
          <SignUp />
        </Provider>,
      );

      expect(getByText('Canada', { exact: false })).toBeOnTheScreen();
      expect(mockSetUserLocation).toHaveBeenCalledWith('international');
      expect(mockSetSelectedCountry).toHaveBeenCalledWith('CA');
    });

    it('does not set userCardLocation when geoLocation is UNKNOWN', () => {
      const storeWithUnknown = createTestStore({ geoLocation: 'UNKNOWN' });

      render(
        <Provider store={storeWithUnknown}>
          <SignUp />
        </Provider>,
      );

      expect(mockSetUserLocation).not.toHaveBeenCalled();
    });

    it('does not set userCardLocation when geoLocation does not match any available region', () => {
      const storeWithUnsupported = createTestStore({ geoLocation: 'JP' });

      render(
        <Provider store={storeWithUnsupported}>
          <SignUp />
        </Provider>,
      );

      expect(mockSetUserLocation).not.toHaveBeenCalled();
    });

    it('pre-selects country when geoLocation matches a canSignUp: false country and enables waitlist mode', () => {
      // GB exists in allRegions with canSignUp: false — now gets auto-selected and shows waitlist CTA
      const storeWithGB = createTestStore({ geoLocation: 'GB' });

      const { getByText, getByTestId, queryByTestId } = render(
        <Provider store={storeWithGB}>
          <SignUp />
        </Provider>,
      );

      // GB is now pre-selected
      expect(getByText('United Kingdom', { exact: false })).toBeOnTheScreen();
      // Button is enabled (country is selected) and shows waitlist label
      expect(getByTestId('signup-continue-button')).toBeEnabled();
      // Country not available info text shown
      expect(
        getByTestId('signup-country-not-available-text'),
      ).toBeOnTheScreen();
      // Password field hidden in waitlist mode
      expect(queryByTestId('signup-password-input')).not.toBeOnTheScreen();
      // GB maps to 'international' location
      expect(mockSetUserLocation).toHaveBeenCalledWith('international');
    });

    it('routes the selected country to the provider via setSelectedCountry on prefill', () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockSetSelectedCountry).toHaveBeenCalledWith('US');
    });

    it('treats an Immersve country as supported (no waitlist) when onboarding is enabled', () => {
      // cardImmersveCountries defaults to ['GB']; enable the gate.
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });

      const { getByText, getByTestId, queryByTestId } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      // GB is pre-selected but treated as supported (Immersve), not waitlist
      expect(getByText('United Kingdom', { exact: false })).toBeOnTheScreen();
      expect(
        queryByTestId('signup-country-not-available-text'),
      ).not.toBeOnTheScreen();
      // Immersve mode: password hidden, phone + account picker shown instead
      expect(queryByTestId('signup-password-input')).not.toBeOnTheScreen();
      expect(
        getByTestId('signup-immersve-phone-number-input'),
      ).toBeOnTheScreen();
      expect(getByTestId('signup-immersve-account-select')).toBeOnTheScreen();
      expect(getByTestId('signup-immersve-account-avatar')).toBeOnTheScreen();
      expect(mockSetSelectedCountry).toHaveBeenCalledWith('GB');
    });

    it('locks sign-up to the Money account when one exists', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      const moneySelectors = jest.requireMock(
        '../../../../../selectors/moneyAccountController',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);
      moneySelectors.selectPrimaryMoneyAccount.mockReturnValue({
        address: '0x1234567890123456789012345678901234567890',
      });
      setMockIsMoneyAccountCountry(true);

      const { getByTestId, queryByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      expect(
        getByTestId('signup-immersve-money-account-row'),
      ).toBeOnTheScreen();
      expect(queryByTestId('signup-immersve-account-select')).toBeNull();
      expect(queryByTestId('signup-money-account-required')).toBeNull();
    });

    it('renders the account picker without an avatar when no account is selected', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);
      setMockImmersveAccount(null, null);

      const { getByTestId, queryByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-immersve-account-select')).toBeOnTheScreen();
      expect(queryByTestId('signup-immersve-account-avatar')).toBeNull();
    });

    it('asks for a Money account when the country requires one and none exists', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);
      setMockIsMoneyAccountCountry(true);

      const { getByTestId, queryByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-money-account-required')).toBeOnTheScreen();
      expect(queryByTestId('signup-immersve-money-account-row')).toBeNull();
      expect(queryByTestId('signup-immersve-account-select')).toBeNull();
    });

    // Unit fallback: SignUp has no *.view.test.tsx; this file already renders
    // the screen with mocked hooks/selectors. Title and description stay on
    // the shared keys for Baanx and Immersve.
    it('uses the shared sign-up title and description for Immersve countries', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });

      const { getByTestId, queryByText } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('onboarding-step-title')).toHaveTextContent(
        'card.card_onboarding.sign_up.title',
      );
      expect(getByTestId('onboarding-step-description')).toHaveTextContent(
        'card.card_onboarding.sign_up.description',
      );
      expect(
        queryByText('card.card_onboarding.sign_up.title_immersve'),
      ).not.toBeOnTheScreen();
      expect(
        queryByText('card.card_onboarding.sign_up.description_immersve'),
      ).not.toBeOnTheScreen();
    });

    it('renders Immersve-only field labels on the signup screen', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });

      const { getByText, getByTestId, queryByText } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      expect(
        getByText('card.card_onboarding.sign_up.email_label'),
      ).toBeOnTheScreen();
      expect(
        getByText('card.card_onboarding.sign_up.phone_number_label_immersve'),
      ).toBeOnTheScreen();
      expect(
        getByText('card.card_onboarding.sign_up.account_label_immersve'),
      ).toBeOnTheScreen();
      expect(
        getByText('card.card_onboarding.sign_up.account_description_immersve'),
      ).toBeOnTheScreen();
      expect(
        getByTestId('signup-i-already-have-an-account-text'),
      ).toHaveTextContent(
        'card.card_onboarding.sign_up.i_already_have_an_account_immersve',
      );
      expect(
        queryByText('card.card_onboarding.set_phone_number.phone_number_label'),
      ).not.toBeOnTheScreen();
    });

    it('keeps the Figma signup copy on the shared English strings', () => {
      const { sign_up: signUp, set_phone_number: setPhoneNumber } =
        en.card.card_onboarding;

      expect(signUp.title).toBe('Set up your MetaMask Card');
      expect(signUp.description).toBe(
        'We need a few details to get your card ready.',
      );
      expect(signUp.email_label).toBe('Email');
      expect(signUp.phone_number_label_immersve).toBe('Phone number');
      expect(signUp.account_label_immersve).toBe('Spending account');
      expect(signUp.account_description_immersve).toBe(
        'Card purchases will come from this account.',
      );
      expect(signUp.i_already_have_an_account_immersve).toBe(
        'I already have a MetaMask Card',
      );
      expect(signUp.clickwrap_prefix).toBe(
        'By pressing "Next", you accept Immersve\'s ',
      );
      expect(setPhoneNumber.phone_number_label).toBe('Enter phone number');
    });

    const enableImmersve = () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);
    };

    const fillImmersveForm = (getByTestId: (id: string) => unknown) => {
      fireEvent.changeText(
        getByTestId('signup-email-input') as never,
        'gb@example.com',
      );
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input') as never,
        '7911123456',
      );
    };

    it('shows Immersve legal clickwrap for Immersve countries', () => {
      enableImmersve();
      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });

      const { getByTestId, queryByTestId } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-immersve-legal-clickwrap')).toBeOnTheScreen();
      expect(queryByTestId('signup-password-input')).not.toBeOnTheScreen();
      expect(mockUseImmersveSupportedRegions).toHaveBeenCalledWith('GB');
    });

    it('hides Immersve legal clickwrap for non-Immersve countries', () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(false);

      const { queryByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      expect(queryByTestId('signup-immersve-legal-clickwrap')).toBeNull();
    });

    it('disables Next while Immersve legal docs are loading', () => {
      enableImmersve();
      mockUseImmersveSupportedRegions.mockReturnValue({
        region: null,
        onboardingDocuments: [],
        permanentDocuments: [],
        isLoading: true,
        error: null,
        refetch: mockRefetchLegalDocs,
      });

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });
      const { getByTestId } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);

      expect(getByTestId('signup-continue-button')).toBeDisabled();
      expect(getByTestId('signup-immersve-legal-loading')).toBeOnTheScreen();
    });

    it('disables Next and shows retry when Immersve legal docs fail to load', () => {
      enableImmersve();
      mockUseImmersveSupportedRegions.mockReturnValue({
        region: null,
        onboardingDocuments: [],
        permanentDocuments: [],
        isLoading: false,
        error: new Error('502'),
        refetch: mockRefetchLegalDocs,
      });

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });
      const { getByTestId } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);

      expect(getByTestId('signup-continue-button')).toBeDisabled();
      fireEvent.press(getByTestId('signup-immersve-legal-retry'));
      expect(mockRefetchLegalDocs).toHaveBeenCalled();
    });

    it('disables Next and shows retry when Immersve legal docs are empty after load', () => {
      enableImmersve();
      mockUseImmersveSupportedRegions.mockReturnValue({
        region: null,
        onboardingDocuments: [],
        permanentDocuments: [],
        isLoading: false,
        error: null,
        refetch: mockRefetchLegalDocs,
      });

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });
      const { getByTestId } = render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);

      expect(getByTestId('signup-continue-button')).toBeDisabled();
      expect(getByTestId('signup-immersve-legal-error')).toBeOnTheScreen();
      fireEvent.press(getByTestId('signup-immersve-legal-retry'));
      expect(mockRefetchLegalDocs).toHaveBeenCalled();
    });

    it('new user: SIWE, creates a funding source, patches contact, then routes', async () => {
      enableImmersve();
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([]);
      mockCreateFundingSource.mockResolvedValue({ id: 'fs-1' });
      mockPatchContactDetails.mockResolvedValue(undefined);
      mockGetSpendingPrerequisites
        .mockResolvedValueOnce({
          prerequisites: [
            {
              stage: 'kyc',
              status: 'action-required',
              actionType: 'submit_contact_phone',
            },
          ],
        })
        .mockResolvedValueOnce({
          prerequisites: [
            {
              stage: 'kyc',
              status: 'action-required',
              actionType: 'follow_kyc_url',
              params: { kycUrl: 'https://kyc' },
            },
          ],
        });

      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);
      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockImmersveSignIn).toHaveBeenCalledWith({
        country: 'GB',
        address: IMMERSVE_TEST_ADDRESS,
      });
      expect(mockGetFundingSources).toHaveBeenCalled();
      expect(mockCreateFundingSource).toHaveBeenCalled();
      await waitFor(() =>
        expect(mockPatchContactDetails).toHaveBeenCalledWith({
          email: 'gb@example.com',
          phone: '+447911123456',
        }),
      );
      expect(mockRouteImmersve).toHaveBeenCalledWith(
        { type: 'kyc', url: 'https://kyc', ctaHint: undefined, reasons: [] },
        expect.objectContaining({
          email: 'gb@example.com',
          countryKey: 'GB',
          hasExistingCard: false,
          fundingAddress: expect.any(String),
        }),
      );
    });

    it('existing user: reuses the funding source (no create) and routes to their state', async () => {
      enableImmersve();
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([{ id: 'fs-existing' }]);
      // Empty prerequisites → all satisfied → active.
      mockGetSpendingPrerequisites.mockResolvedValue({ prerequisites: [] });

      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);
      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockCreateFundingSource).not.toHaveBeenCalled();
      expect(mockPatchContactDetails).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mockGetSpendingPrerequisites).toHaveBeenCalledWith(
          'fs-existing',
          expect.anything(),
        ),
      );
      expect(mockRouteImmersve).toHaveBeenCalledWith(
        { type: 'active' },
        expect.objectContaining({
          email: 'gb@example.com',
          countryKey: 'GB',
          hasExistingCard: false,
          fundingAddress: expect.any(String),
        }),
      );
    });

    it('surfaces an inline error and does not route when resolution fails', async () => {
      enableImmersve();
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockRejectedValue(new Error('boom'));

      const { getByTestId, queryByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);
      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockRouteImmersve).not.toHaveBeenCalled();
      expect(queryByTestId('signup-immersve-error-text')).toBeOnTheScreen();
    });

    it('dismisses the keyboard without continuing when the phone keypad is submitted', async () => {
      enableImmersve();
      const dismissSpy = jest
        .spyOn(Keyboard, 'dismiss')
        .mockImplementation(() => undefined);

      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      fillImmersveForm(getByTestId);
      await act(async () => {
        fireEvent(
          getByTestId('signup-immersve-phone-number-input'),
          'onSubmitEditing',
        );
      });

      expect(dismissSpy).toHaveBeenCalled();
      expect(mockImmersveSignIn).not.toHaveBeenCalled();
      expect(mockRouteImmersve).not.toHaveBeenCalled();
      dismissSpy.mockRestore();
    });

    it('does not re-run auto-selection when getRegionByCode reference changes after initial selection', () => {
      // Simulates a background re-fetch of registrationSettings that produces a
      // new getRegionByCode reference without changing the actual data.
      const storeWithGeo = createTestStore({ geoLocation: 'US' });
      const mockUseRegions = jest.requireMock('../../hooks/useRegions').default;

      const firstGetRegionByCode = jest.fn(mockGetRegionByCode);
      mockUseRegions.mockReturnValue({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
        getRegionByCode: firstGetRegionByCode,
        isLoading: false,
        isRegistrationSettingsFetched: true,
      });

      const { getByText, rerender } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      // US was auto-selected on first render
      expect(getByText('United States', { exact: false })).toBeOnTheScreen();
      expect(firstGetRegionByCode).toHaveBeenCalledTimes(1);

      // Simulate background refetch: new function identity, same data
      const secondGetRegionByCode = jest.fn(mockGetRegionByCode);
      mockUseRegions.mockReturnValue({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
        getRegionByCode: secondGetRegionByCode,
        isLoading: false,
        isRegistrationSettingsFetched: true,
      });

      rerender(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      // hasAutoSelectedCountry ref must have blocked the second run
      expect(secondGetRegionByCode).not.toHaveBeenCalled();
      expect(getByText('United States', { exact: false })).toBeOnTheScreen();
      expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('UK migration handoff', () => {
    const enableImmersve = () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);
    };

    beforeEach(() => {
      mockUseRoute.mockReturnValue({ params: { fromMigration: true } });
      enableImmersve();
    });

    it('preselects UK without calling setSelectedCountry on mount', () => {
      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'US' })}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-country-select')).toHaveTextContent(
        /United Kingdom/,
      );
      expect(mockSetSelectedCountry).not.toHaveBeenCalled();
      expect(mockSetUserLocation).not.toHaveBeenCalled();
    });

    it('hides the already-have-an-account link', () => {
      const { queryByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'US' })}>
          <SignUp />
        </Provider>,
      );

      expect(
        queryByTestId('signup-i-already-have-an-account-text'),
      ).not.toBeOnTheScreen();
    });

    it('ignores country select presses', () => {
      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'US' })}>
          <SignUp />
        </Provider>,
      );

      fireEvent.press(getByTestId('signup-country-select'));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows migration clickwrap suffix', () => {
      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-immersve-legal-clickwrap')).toHaveTextContent(
        /clickwrap_suffix_migration/,
      );
    });

    it('tracks CARD_VIEWED with migration flow props', async () => {
      render(
        <Provider store={createTestStore({ geoLocation: 'US' })}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: MetaMetricsEvents.CARD_VIEWED.category,
            properties: {
              provider: 'immersve',
              screen: CardScreens.SIGN_UP,
              flow: CardFlow.MIGRATION,
              migration_phase: 'grace_window',
              badge_reasons: ['card_migration'],
              country_prefill_status: 'skipped_uk_migration',
              location_format: 'country',
            },
          }),
        );
      });
    });

    it('tracks SIGN_UP_BUTTON with migration flow and country codes only', async () => {
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([{ id: 'fs-existing' }]);
      mockGetSpendingPrerequisites.mockResolvedValue({ prerequisites: [] });

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(getByTestId('signup-email-input'), 'gb@example.com');
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7911123456',
      );
      mockTrackEvent.mockClear();

      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      const buttonEvent = mockTrackEvent.mock.calls
        .map(
          (call) =>
            call[0] as {
              name: string;
              properties: Record<string, unknown>;
            },
        )
        .find(
          (event) =>
            event.name === MetaMetricsEvents.CARD_BUTTON_CLICKED.category,
        );

      expect(buttonEvent?.properties).toEqual({
        provider: 'immersve',
        action: CardActions.SIGN_UP_BUTTON,
        flow: CardFlow.MIGRATION,
        migration_phase: 'grace_window',
        badge_reasons: ['card_migration'],
        country_of_residence: 'GB',
        phone_number_country_code: '44',
      });
      expect(buttonEvent?.properties).not.toHaveProperty('email');
      expect(buttonEvent?.properties).not.toHaveProperty('phone');
    });

    it('prefills phone region after regions load when user details were pending', async () => {
      const mockUseRegions = jest.requireMock('../../hooks/useRegions').default;

      mockUseRegions.mockReturnValue({
        allRegions: [],
        signUpRegions: [],
        getRegionByCode: mockGetRegionByCode,
        isLoading: true,
      });
      mockGetUserDetails.mockResolvedValue({
        email: 'migrating@example.com',
        phoneNumber: '1512345678',
        phoneCountryCode: '+49',
      });

      const { getByTestId, rerender } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      expect(mockGetUserDetails).not.toHaveBeenCalled();

      mockUseRegions.mockReturnValue({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
        getRegionByCode: mockGetRegionByCode,
        isLoading: false,
      });

      rerender(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(mockGetUserDetails).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          getByTestId('signup-immersve-phone-area-code-select'),
        ).toHaveTextContent(/\+49/);
      });

      mockUseRegions.mockImplementation(() => ({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
        getRegionByCode: mockGetRegionByCode,
        isLoading: false,
      }));
    });

    it('prefills UK phone region when multiple +44 regions exist', async () => {
      const mockUseRegions = jest.requireMock('../../hooks/useRegions').default;
      const regionsWithEnglandFirst = [
        {
          key: 'ENG',
          name: 'England',
          emoji: '🏴',
          areaCode: '44',
          canSignUp: true,
        },
        ...mockSignUpRegions,
      ];
      const getRegionByCodeWithEngland = (code: string) =>
        regionsWithEnglandFirst.find((r) => r.key === code) ?? null;

      mockUseRegions.mockReturnValue({
        allRegions: regionsWithEnglandFirst,
        signUpRegions: regionsWithEnglandFirst.filter((r) => r.canSignUp),
        getRegionByCode: getRegionByCodeWithEngland,
        isLoading: false,
      });
      mockGetUserDetails.mockResolvedValue({
        email: 'migrating@example.com',
        phoneNumber: '7581572277',
        phoneCountryCode: '+44',
      });

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      // Wait for prefill (not only UK auto-select) so a first-match +44 region
      // would fail if GB preference were missing.
      await waitFor(() => {
        expect(mockGetUserDetails).toHaveBeenCalled();
        expect(getByTestId('signup-immersve-phone-number-input')).toHaveProp(
          'value',
          '7581572277',
        );
      });
      expect(
        getByTestId('signup-immersve-phone-area-code-select'),
      ).toHaveTextContent(/🇬🇧/);
      expect(
        getByTestId('signup-immersve-phone-area-code-select'),
      ).not.toHaveTextContent(/🏴/);

      mockUseRegions.mockImplementation(() => ({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter((r) => r.canSignUp),
        getRegionByCode: mockGetRegionByCode,
        isLoading: false,
      }));
    });

    it('prefills email and phone from Baanx user details when available', async () => {
      mockGetUserDetails.mockResolvedValue({
        email: 'migrating@example.com',
        phoneNumber: '7911123456',
        phoneCountryCode: '+44',
      });

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(getByTestId('signup-email-input')).toHaveProp(
          'value',
          'migrating@example.com',
        );
      });
      expect(getByTestId('signup-immersve-phone-number-input')).toHaveProp(
        'value',
        '7911123456',
      );
      expect(
        getByTestId('signup-immersve-phone-area-code-select'),
      ).toHaveTextContent(/\+44/);
      // UK auto-select must not re-trigger prefill (selectedCountry is not a dep).
      expect(mockGetUserDetails).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite user edits when prefill resolves late', async () => {
      let resolveUserDetails: (value: {
        email: string;
        phoneNumber: string;
        phoneCountryCode: string;
      }) => void = () => undefined;
      mockGetUserDetails.mockReset();
      mockGetUserDetails.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUserDetails = resolve;
          }),
      );

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(
        getByTestId('signup-email-input'),
        'user@example.com',
      );
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7700900123',
      );

      await act(async () => {
        resolveUserDetails({
          email: 'migrating@example.com',
          phoneNumber: '7911123456',
          phoneCountryCode: '+44',
        });
        await Promise.resolve();
      });

      expect(getByTestId('signup-email-input')).toHaveProp(
        'value',
        'user@example.com',
      );
      expect(getByTestId('signup-immersve-phone-number-input')).toHaveProp(
        'value',
        '7700900123',
      );
    });

    it('does not overwrite phone region when area code is changed before prefill resolves', async () => {
      let resolveUserDetails: (value: {
        email: string;
        phoneNumber: string;
        phoneCountryCode: string;
      }) => void = () => undefined;
      mockGetUserDetails.mockReset();
      mockGetUserDetails.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUserDetails = resolve;
          }),
      );

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.press(getByTestId('signup-immersve-phone-area-code-select'));
      capturedOnValueChange?.({
        key: 'DE',
        name: 'Germany',
        emoji: '🇩🇪',
        areaCode: '49',
        canSignUp: true,
      });

      await act(async () => {
        resolveUserDetails({
          email: 'migrating@example.com',
          phoneNumber: '7911123456',
          phoneCountryCode: '+44',
        });
        await Promise.resolve();
      });

      expect(
        getByTestId('signup-immersve-phone-area-code-select'),
      ).toHaveTextContent(/\+49/);
      expect(
        getByTestId('signup-immersve-phone-area-code-select'),
      ).not.toHaveTextContent(/\+44/);
    });

    it('leaves fields empty when user-details prefill fails', async () => {
      mockGetUserDetails.mockRejectedValue(new Error('unauthorized'));

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(mockGetUserDetails).toHaveBeenCalled();
      });
      expect(getByTestId('signup-email-input')).toHaveProp('value', '');
      expect(getByTestId('signup-immersve-phone-number-input')).toHaveProp(
        'value',
        '',
      );
    });

    it('calls beginMigration before Immersve continue on Next', async () => {
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([]);
      mockCreateFundingSource.mockResolvedValue({ id: 'fs-1' });
      mockPatchContactDetails.mockResolvedValue(undefined);
      mockGetSpendingPrerequisites
        .mockResolvedValueOnce({
          prerequisites: [
            {
              stage: 'kyc',
              status: 'action-required',
              actionType: 'submit_contact_phone',
            },
          ],
        })
        .mockResolvedValueOnce({
          prerequisites: [
            {
              stage: 'kyc',
              status: 'action-required',
              actionType: 'follow_kyc_url',
              params: { kycUrl: 'https://kyc' },
            },
          ],
        });

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(getByTestId('signup-email-input'), 'gb@example.com');
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7911123456',
      );

      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockRequestLegacyAccountClosure).toHaveBeenCalledTimes(1);
      expect(mockBeginMigration).toHaveBeenCalledTimes(1);
      expect(
        mockRequestLegacyAccountClosure.mock.invocationCallOrder[0],
      ).toBeLessThan(mockBeginMigration.mock.invocationCallOrder[0]);
      await waitFor(() => {
        expect(mockImmersveSignIn).toHaveBeenCalled();
      });
      expect(mockBeginMigration.mock.invocationCallOrder[0]).toBeLessThan(
        mockImmersveSignIn.mock.invocationCallOrder[0],
      );
    });

    it('continues Immersve sign-up when legacy account closure fails', async () => {
      mockRequestLegacyAccountClosure.mockRejectedValue(
        new Error('closure failed'),
      );
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([]);
      mockCreateFundingSource.mockResolvedValue({ id: 'fs-1' });
      mockPatchContactDetails.mockResolvedValue(undefined);
      mockGetSpendingPrerequisites.mockResolvedValue({ prerequisites: [] });

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(getByTestId('signup-email-input'), 'gb@example.com');
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7911123456',
      );

      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockBeginMigration).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(mockImmersveSignIn).toHaveBeenCalled();
      });
    });

    it('calls cancelMigration when Immersve continue fails after beginMigration', async () => {
      mockImmersveSignIn.mockRejectedValue(new Error('user rejected'));

      const { getByTestId } = render(
        <Provider store={createTestStore()}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(getByTestId('signup-email-input'), 'gb@example.com');
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7911123456',
      );

      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      await waitFor(() => {
        expect(mockBeginMigration).toHaveBeenCalledTimes(1);
        expect(mockCancelMigration).toHaveBeenCalledTimes(1);
      });
      expect(mockBeginMigration.mock.invocationCallOrder[0]).toBeLessThan(
        mockCancelMigration.mock.invocationCallOrder[0],
      );
    });

    it('does not call logout for non-migration Immersve continue', async () => {
      mockUseRoute.mockReturnValue({ params: undefined });
      mockImmersveSignIn.mockResolvedValue({ done: true });
      mockGetFundingSources.mockResolvedValue([{ id: 'fs-existing' }]);
      mockGetSpendingPrerequisites.mockResolvedValue({ prerequisites: [] });

      const { getByTestId } = render(
        <Provider store={createTestStore({ geoLocation: 'GB' })}>
          <SignUp />
        </Provider>,
      );

      fireEvent.changeText(getByTestId('signup-email-input'), 'gb@example.com');
      fireEvent.changeText(
        getByTestId('signup-immersve-phone-number-input'),
        '7911123456',
      );

      await act(async () => {
        fireEvent.press(getByTestId('signup-continue-button'));
      });

      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockRequestLegacyAccountClosure).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(mockImmersveSignIn).toHaveBeenCalled();
      });
    });
  });
});
