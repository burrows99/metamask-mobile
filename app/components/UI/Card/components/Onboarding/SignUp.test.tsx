import {
  createTestStore,
  getCapturedOnValueChange,
  mockGetRegionByCode,
  mockSetUserLocation,
  mockSignUpRegions,
  mockTrackEvent,
  mockUseCardPostAuthRedirect,
  setupSignUpMocks,
} from './SignUp.testUtils';
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import useEmailVerificationSend from '../../hooks/useEmailVerificationSend';
import { validateEmail } from '../../../Ramp/utils/depositUtils';
import { validatePassword } from '../../util/validatePassword';
import SignUp from './SignUp';
import Routes from '../../../../../constants/navigation/Routes';
import { MONEY_HOME_CARD_ORIGIN } from '../../hooks/useCardPostAuthRedirect';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import { CardActions, CardScreens } from '../../util/metrics';

describe('SignUp Component', () => {
  let store: ReturnType<typeof createTestStore>;
  let mockSendEmailVerification: jest.Mock;
  let mockNavigate: jest.Mock;
  let mockGoBack: jest.Mock;

  beforeEach(() => {
    ({ store, mockSendEmailVerification, mockNavigate, mockGoBack } =
      setupSignUpMocks());
  });

  describe('Analytics', () => {
    const eventsNamed = (event: { category: string }) =>
      mockTrackEvent.mock.calls
        .map(
          (call) =>
            call[0] as {
              name: string;
              properties: Record<string, unknown>;
            },
        )
        .filter((trackedEvent) => trackedEvent?.name === event.category);

    it('tracks a prefilled country on CARD_VIEWED without a failure reason', async () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)).toHaveLength(1);
      });
      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0].properties).toEqual({
        provider: 'baanx',
        screen: CardScreens.SIGN_UP,
        country_prefill_status: 'prefilled',
        location_format: 'country',
      });
    });

    it('tracks CARD_VIEWED with immersve provider for Immersve countries', async () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);

      const storeWithImmersve = createTestStore({ geoLocation: 'GB' });

      render(
        <Provider store={storeWithImmersve}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(
          eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties,
        ).toEqual({
          provider: 'immersve',
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'prefilled',
          location_format: 'country',
        });
      });
    });

    it('tracks CARD_VIEWED once when the user later changes country', async () => {
      const { selectCardImmersveEnabled } = jest.requireMock(
        '../../../../../selectors/featureFlagController/card',
      );
      (selectCardImmersveEnabled as jest.Mock).mockReturnValue(true);

      const storeWithGeo = createTestStore({ geoLocation: 'US' });
      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      await waitFor(() => {
        expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)).toHaveLength(1);
      });

      mockTrackEvent.mockClear();

      fireEvent.press(getByTestId('signup-country-select'));
      expect(getCapturedOnValueChange()).toBeTruthy();
      await act(async () => {
        getCapturedOnValueChange()?.({
          key: 'GB',
          name: 'United Kingdom',
          canSignUp: true,
        });
      });

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)).toHaveLength(0);
    });

    it('tracks CARD_VIEWED after registration settings finish fetching', () => {
      const mockUseRegions = jest.requireMock('../../hooks/useRegions').default;
      const regionsResult = {
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter(
          (region: { canSignUp: boolean }) => region.canSignUp,
        ),
        getRegionByCode: mockGetRegionByCode,
        isLoading: false,
        isRegistrationSettingsFetched: true,
      };
      mockUseRegions.mockReturnValue({
        allRegions: [],
        signUpRegions: [],
        getRegionByCode: () => null,
        isLoading: true,
        isRegistrationSettingsFetched: false,
      });

      const storeWithGeo = createTestStore({ geoLocation: 'GB' });
      const { rerender } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockTrackEvent).not.toHaveBeenCalled();

      mockUseRegions.mockReturnValue(regionsResult);
      rerender(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: MetaMetricsEvents.CARD_VIEWED.category,
          properties: expect.objectContaining({
            country_prefill_status: 'prefilled',
            location_format: 'country',
          }),
        }),
      );

      mockUseRegions.mockImplementation(() => regionsResult);
    });

    it('tracks CARD_VIEWED when a known location has no terminal geolocation status', () => {
      render(
        <Provider
          store={createTestStore({ geoLocation: 'GB', geoStatus: 'idle' })}
        >
          <SignUp />
        </Provider>,
      );

      expect(mockSetUserLocation).toHaveBeenCalledWith('international');
      expect(mockTrackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: MetaMetricsEvents.CARD_VIEWED.category,
          properties: expect.objectContaining({
            country_prefill_status: 'prefilled',
            location_format: 'country',
          }),
        }),
      );
    });

    it('does not track CARD_VIEWED while geolocation is loading', () => {
      const storeWithGeo = createTestStore({
        geoLocation: 'GB',
        geoStatus: 'loading',
      });

      render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockTrackEvent).not.toHaveBeenCalled();
      expect(mockSetUserLocation).toHaveBeenCalledWith('international');
    });

    it('tracks CARD_VIEWED after a loading geolocation resolves to a country', () => {
      const storeWithGeo = createTestStore({
        geoLocation: 'UNKNOWN',
        geoStatus: 'loading',
      });

      render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      expect(mockTrackEvent).not.toHaveBeenCalled();

      act(() => {
        storeWithGeo.dispatch({
          type: 'test/set-geolocation',
          payload: { location: 'GB', status: 'complete' },
        });
      });

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties).toEqual(
        {
          provider: 'baanx',
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'prefilled',
          location_format: 'country',
        },
      );
    });

    it('tracks a geolocation error without a provider', () => {
      render(
        <Provider
          store={createTestStore({ geoLocation: 'US', geoStatus: 'error' })}
        >
          <SignUp />
        </Provider>,
      );

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties).toEqual(
        {
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'failed',
          country_prefill_failure_reason: 'geolocation_error',
          location_format: 'country',
        },
      );
      expect(mockSetUserLocation).not.toHaveBeenCalled();
    });

    it('tracks an unknown location after geolocation completes', () => {
      render(
        <Provider store={createTestStore({ geoLocation: 'UNKNOWN' })}>
          <SignUp />
        </Provider>,
      );

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties).toEqual(
        {
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'failed',
          country_prefill_failure_reason: 'unknown_location',
          location_format: 'unknown',
        },
      );
    });

    it('tracks a location that is not a registration country', () => {
      render(
        <Provider store={createTestStore({ geoLocation: 'JP' })}>
          <SignUp />
        </Provider>,
      );

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties).toEqual(
        {
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'failed',
          country_prefill_failure_reason: 'unmatched_location',
          location_format: 'country',
        },
      );
    });

    it('tracks unavailable registration settings ahead of geolocation', () => {
      const mockUseRegions = jest.requireMock('../../hooks/useRegions').default;
      mockUseRegions.mockReturnValue({
        allRegions: [],
        signUpRegions: [],
        getRegionByCode: () => null,
        isLoading: false,
        isRegistrationSettingsFetched: true,
      });

      render(
        <Provider
          store={createTestStore({ geoLocation: 'GB', geoStatus: 'error' })}
        >
          <SignUp />
        </Provider>,
      );

      expect(eventsNamed(MetaMetricsEvents.CARD_VIEWED)[0]?.properties).toEqual(
        {
          screen: CardScreens.SIGN_UP,
          country_prefill_status: 'failed',
          country_prefill_failure_reason: 'registration_settings_unavailable',
          location_format: 'country',
        },
      );

      mockUseRegions.mockImplementation(() => ({
        allRegions: mockSignUpRegions,
        signUpRegions: mockSignUpRegions.filter(
          (region: { canSignUp: boolean }) => region.canSignUp,
        ),
        getRegionByCode: mockGetRegionByCode,
        isLoading: false,
        isRegistrationSettingsFetched: true,
      }));
    });

    it('tracks CARD_BUTTON_CLICKED with SIGN_UP_BUTTON when continue is pressed', async () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'Password123!');
      });

      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });

      mockTrackEvent.mockClear();

      await act(async () => {
        fireEvent.press(continueButton);
      });

      expect(eventsNamed(MetaMetricsEvents.CARD_BUTTON_CLICKED)).toEqual([
        expect.objectContaining({
          properties: {
            provider: 'baanx',
            action: CardActions.SIGN_UP_BUTTON,
          },
        }),
      ]);
    });
  });

  describe('Initial Render', () => {
    it('renders all form fields with correct testIDs', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      expect(getByTestId('signup-email-input')).toBeTruthy();
      expect(getByTestId('signup-password-input')).toBeTruthy();
      expect(getByTestId('signup-country-select')).toBeTruthy();
      expect(getByTestId('signup-continue-button')).toBeTruthy();
      expect(getByTestId('signup-password-visibility-toggle')).toBeTruthy();
    });

    it('has continue button disabled initially', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const continueButton = getByTestId('signup-continue-button');
      expect(continueButton).toBeDisabled();
    });

    it('does not show error messages initially', () => {
      const { queryByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      expect(queryByTestId('signup-email-error-text')).not.toBeOnTheScreen();
      expect(queryByTestId('signup-password-error-text')).not.toBeOnTheScreen();
    });
  });

  describe('Email Input', () => {
    it('uses the email keyboard and autofill hints', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      expect(emailInput.props.keyboardType).toBe('email-address');
      expect(emailInput.props.autoComplete).toBe('email');
      expect(emailInput.props.textContentType).toBe('emailAddress');
      expect(emailInput.props.autoCapitalize).toBe('none');
      expect(emailInput.props.autoCorrect).toBe(false);
    });

    it('allows text input', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      fireEvent.changeText(emailInput, 'test@example.com');

      expect(emailInput.props.value).toBe('test@example.com');
    });

    it('shows error message when email is invalid', async () => {
      (validateEmail as jest.Mock).mockReturnValue(false);
      const { getByTestId, findByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      await act(async () => {
        fireEvent.changeText(emailInput, 'invalid-email');
      });

      const errorText = await findByTestId('signup-email-error-text');
      expect(errorText).toBeTruthy();
    });

    it('does not show error message when email is valid', async () => {
      (validateEmail as jest.Mock).mockReturnValue(true);
      const { getByTestId, queryByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      await act(async () => {
        fireEvent.changeText(emailInput, 'valid@example.com');
      });

      await waitFor(() => {
        expect(queryByTestId('signup-email-error-text')).not.toBeOnTheScreen();
      });
    });
  });

  describe('Password Input', () => {
    it('allows text input', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const passwordInput = getByTestId('signup-password-input');
      fireEvent.changeText(passwordInput, 'password123');

      expect(passwordInput.props.value).toBe('password123');
    });

    it('has password hidden by default (secureTextEntry)', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const passwordInput = getByTestId('signup-password-input');
      expect(passwordInput.props.secureTextEntry).toBe(true);
    });

    it('toggles password visibility when eye icon is pressed', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const passwordInput = getByTestId('signup-password-input');
      const visibilityToggle = getByTestId('signup-password-visibility-toggle');

      // Initially hidden
      expect(passwordInput.props.secureTextEntry).toBe(true);

      // Press to show password
      fireEvent.press(visibilityToggle);
      expect(passwordInput.props.secureTextEntry).toBe(false);

      // Press again to hide password
      fireEvent.press(visibilityToggle);
      expect(passwordInput.props.secureTextEntry).toBe(true);
    });

    it('shows description by default when no error', () => {
      const { getByText, queryByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      // Description should be visible
      expect(
        getByText('card.card_onboarding.sign_up.password_description'),
      ).toBeTruthy();

      // Error should not be visible
      expect(queryByTestId('signup-password-error-text')).not.toBeOnTheScreen();
    });

    it('shows error message and hides description when password is invalid', async () => {
      (validatePassword as jest.Mock).mockReturnValue(false);
      const { getByTestId, findByTestId, queryByText } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const passwordInput = getByTestId('signup-password-input');
      await act(async () => {
        fireEvent.changeText(passwordInput, 'weak');
      });

      // Error should be visible
      const errorText = await findByTestId('signup-password-error-text');
      expect(errorText).toBeTruthy();

      // Description should be hidden when error is shown
      expect(
        queryByText('card.card_onboarding.sign_up.password_description'),
      ).not.toBeOnTheScreen();
    });

    it('shows description again when password becomes valid', async () => {
      (validatePassword as jest.Mock).mockReturnValue(false);
      const { getByTestId, findByTestId, queryByTestId, getByText } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const passwordInput = getByTestId('signup-password-input');

      // First, enter invalid password
      await act(async () => {
        fireEvent.changeText(passwordInput, 'weak');
      });

      // Error should be visible
      await findByTestId('signup-password-error-text');

      // Now enter valid password
      (validatePassword as jest.Mock).mockReturnValue(true);
      await act(async () => {
        fireEvent.changeText(passwordInput, 'ValidPassword123!');
      });

      // Error should be hidden
      await waitFor(() => {
        expect(
          queryByTestId('signup-password-error-text'),
        ).not.toBeOnTheScreen();
      });

      // Description should be visible again
      expect(
        getByText('card.card_onboarding.sign_up.password_description'),
      ).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('enables continue button when all fields are valid', async () => {
      // useRegions is mocked to return signUpRegions; geoLocation US prefills country via effect
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      // Fill in all form fields
      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'Password123!');
      });

      // Now check if the continue button is enabled
      await waitFor(
        () => {
          expect(continueButton).toBeEnabled();
        },
        { timeout: 3000 },
      );
    });

    it('keeps continue button disabled when email is invalid', async () => {
      (validateEmail as jest.Mock).mockReturnValue(false);
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'invalid-email');
        fireEvent.changeText(passwordInput, 'Password123!');
      });

      await waitFor(() => {
        expect(continueButton).toBeDisabled();
      });
    });

    it('keeps continue button disabled when password is invalid', async () => {
      (validatePassword as jest.Mock).mockReturnValue(false);
      const storeWithCountry = createTestStore({
        onboarding: {
          selectedCountry: { key: 'US', name: 'United States' },
          onboardingId: null,
          contactVerificationId: null,
          user: null,
        },
      });

      const { getByTestId } = render(
        <Provider store={storeWithCountry}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'weak');
      });

      await waitFor(() => {
        expect(continueButton).toBeDisabled();
      });
    });

    it('keeps continue button disabled when no country is selected', async () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'Password123!');
        // Don't select country
      });

      await waitFor(() => {
        expect(continueButton).toBeDisabled();
      });
    });
  });

  describe('Form Submission', () => {
    it('calls sendEmailVerification when continue button is pressed', async () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'Password123!');
      });

      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });

      await act(async () => {
        fireEvent.press(continueButton);
      });

      expect(mockSendEmailVerification).toHaveBeenCalled();
    });

    it('passes countryKey to ConfirmEmail navigation params', async () => {
      const storeWithGeo = createTestStore({ geoLocation: 'US' });

      const { getByTestId } = render(
        <Provider store={storeWithGeo}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      const passwordInput = getByTestId('signup-password-input');
      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
        fireEvent.changeText(passwordInput, 'Password123!');
      });

      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });

      await act(async () => {
        fireEvent.press(continueButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'test@example.com',
          password: 'Password123!',
          countryKey: 'US',
        }),
      );
    });

    it('does not call sendEmailVerification when continue button is disabled', async () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const continueButton = getByTestId('signup-continue-button');

      await act(async () => {
        fireEvent.press(continueButton);
      });

      expect(mockSendEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('shows email verification error when present', async () => {
      (useEmailVerificationSend as jest.Mock).mockReturnValue({
        sendEmailVerification: jest.fn(),
        isLoading: false,
        isError: true,
        error: 'Email verification failed',
        reset: jest.fn(),
      });

      const { getByTestId, findByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const emailInput = getByTestId('signup-email-input');
      await act(async () => {
        fireEvent.changeText(emailInput, 'test@example.com');
      });

      const errorText = await findByTestId('signup-email-error-text');
      expect(errorText).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('navigates to authentication when "I already have an account" is pressed (direct card flow)', () => {
      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      const alreadyHaveAccountButton = getByTestId(
        'signup-i-already-have-an-account-text',
      );
      fireEvent.press(alreadyHaveAccountButton);

      expect(mockNavigate).toHaveBeenCalledWith(
        Routes.CARD.AUTHENTICATION,
        undefined,
        { pop: true, merge: true },
      );
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('forwards postAuthRedirect to authentication when opened from Money', () => {
      mockUseCardPostAuthRedirect.mockReturnValue(MONEY_HOME_CARD_ORIGIN);

      const { getByTestId } = render(
        <Provider store={store}>
          <SignUp />
        </Provider>,
      );

      fireEvent.press(getByTestId('signup-i-already-have-an-account-text'));

      expect(mockNavigate).toHaveBeenCalledWith(
        Routes.CARD.AUTHENTICATION,
        { postAuthRedirect: MONEY_HOME_CARD_ORIGIN },
        { pop: true, merge: true },
      );
      expect(mockGoBack).not.toHaveBeenCalled();
    });
  });
});
