import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { OtplessHeadlessModule } from 'otpless-headless-rn';

// Define types for OTPLESS response
interface OtplessResponse {
  responseType: string;
  statusCode?: number;
  response: {
    authType?: string;
    otp?: string;
    token?: string;
    idToken?: string; // Added for potential alternative token field
    errorCode?: string;
    errorMessage?: string;
    deliveryChannel?: string;
    data?: { token?: string }; // Added for nested token possibility
  };
}

const App: React.FC = () => {
  const headlessModule = new OtplessHeadlessModule();
  const [authMethod, setAuthMethod] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [email, setEmail] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);

  useEffect(() => {
    // Initialize SDK with your App ID
    headlessModule.initialize('9DRP3BQPAKLIZYTVT2JS');
    headlessModule.setResponseCallback(onHeadlessResult);
    return () => {
      headlessModule.clearListener();
      headlessModule.cleanup();
    };
  }, []);

  // Start phone authentication
  const startPhoneAuth = () => {
    if (!phoneNumber || !countryCode) {
      Alert.alert('Error', 'Please enter phone number and country code');
      return;
    }
    const request = {
      phone: phoneNumber.replace(/\D/g, ''), // Remove non-digits
      countryCode: countryCode.startsWith('+') ? countryCode : `+${countryCode}`,
    };
    console.log('Phone Auth Request:', JSON.stringify(request));
    headlessModule.start(request);
  };

  // Start email authentication
  const startEmailAuth = () => {
    if (!email) {
      Alert.alert('Error', 'Please enter email address');
      return;
    }
    const request = {
      email: email.trim().toLowerCase(),
    };
    console.log('Email Auth Request:', JSON.stringify(request));
    headlessModule.start(request);
  };

  // Start OAuth authentication
  const startOAuth = (channel: string) => {
    const request = { channelType: channel };
    console.log('OAuth Request:', JSON.stringify(request));
    headlessModule.start(request);
  };

  // Verify OTP (for phone or email)
  const verifyOtp = () => {
    if (!otp) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }
    const request =
      authMethod === 'phone'
        ? {
            phone: phoneNumber.replace(/\D/g, ''),
            countryCode: countryCode.startsWith('+') ? countryCode : `+${countryCode}`,
            otp,
          }
        : {
            email: email.trim().toLowerCase(),
            otp,
          };
    console.log('Verification Request:', JSON.stringify(request));
    headlessModule.start(request); // Use start for OTP verification
  };

  // Handle headless SDK responses
  const onHeadlessResult = (result: OtplessResponse) => {
    headlessModule.commitResponse(result);
    const responseType = result.responseType;
    console.log(`Response Type: ${responseType}, Full Response:`, JSON.stringify(result));

    switch (responseType) {
      case 'SDK_READY':
        console.log('SDK is ready with App ID: 9DRP3BQPAKLIZYTVT2JS');
        break;
      case 'FAILED':
        console.error('SDK initialization failed:', result.response.errorMessage);
        Alert.alert('Error', `SDK initialization failed: ${result.response.errorMessage || 'Unknown error'}`);
        break;
      case 'INITIATE':
        if (result.statusCode === 200) {
          console.log('Headless authentication initiated');
          const authType = result.response.authType;
          if (authType === 'OTP') {
            setIsOtpSent(true);
            Alert.alert(
              'Success',
              `OTP sent to your ${authMethod === 'email' ? 'email' : 'phone number'}`
            );
          } else {
            Alert.alert('Info', `Initiated ${authType} authentication`);
          }
        } else {
          const errorMessage = handleInitiateError(result.response);
          Alert.alert('Error', errorMessage || 'Failed to initiate authentication');
        }
        break;
      case 'OTP_AUTO_READ':
        if (Platform.OS === 'android' && authMethod === 'phone') {
          const receivedOtp = result.response.otp;
          console.log(`OTP Received: ${receivedOtp}`);
          setOtp(receivedOtp || '');
          if (receivedOtp) verifyOtp();
        }
        break;
      case 'VERIFY':
        if (result.statusCode === 200) {
          const token = result.response.token;
          if (token) {
            console.log(`Token: ${token}`);
            Alert.alert('Success', `Login successful! Token: ${token}`);
            resetForm();
          } else {
            console.error('Token missing in VERIFY response');
            Alert.alert('Error', 'Verification succeeded, but no token was returned');
          }
        } else {
          const errorMessage = handleVerifyError(result.response);
          Alert.alert('Error', errorMessage || 'OTP verification failed');
        }
        break;
      case 'DELIVERY_STATUS':
        const authType = result.response.authType;
        const deliveryChannel = result.response.deliveryChannel;
        console.log(`Delivery Status: ${authType} via ${deliveryChannel}`);
        break;
      case 'ONETAP':
        console.log('ONETAP Response Details:', JSON.stringify(result.response));
        const token = result.response.token || result.response.idToken || result.response.data?.token;
        if (token) {
          console.log(`OneTap Token: ${token}`);
          Alert.alert('Success', `Login successful! Token: ${token}`);
          resetForm();
        } else {
          console.error('Token missing in ONETAP response. Full response:', JSON.stringify(result));
          Alert.alert(
            'Error',
            'OneTap authentication succeeded, but no token was returned. Check logs for details.'
          );
        }
        break;
      case 'FALLBACK_TRIGGERED':
        const newDeliveryChannel = result.response.deliveryChannel;
        if (newDeliveryChannel) {
          Alert.alert('Info', `OTP sent via ${newDeliveryChannel}`);
        }
        break;
      default:
        console.warn(`Unknown response type: ${responseType}`);
        break;
    }
  };

  // Reset form after successful login or when going back
  const resetForm = () => {
    setIsOtpSent(false);
    setPhoneNumber('');
    setCountryCode('+91');
    setEmail('');
    setOtp('');
    setAuthMethod(null);
  };

  // Error handling for initiation
  const handleInitiateError = (response: { errorCode?: string; errorMessage?: string }): string => {
    const errorCode = response?.errorCode;
    const errorMessage = response?.errorMessage || 'Initiation error';
    switch (errorCode) {
      case '1001':
      case '1002':
        return 'Too many requests. Please try again later';
      case '1003':
        return 'Invalid App ID or unauthorized request';
      case '4000':
        return 'Invalid phone number or email format';
      case '9100':
      case '9103':
      case '9104':
        return 'Network error. Please check your connection';
      default:
        return errorMessage;
    }
  };

  // Error handling for verification
  const handleVerifyError = (response: { errorCode?: string; errorMessage?: string }): string => {
    const errorCode = response?.errorCode;
    const errorMessage = response?.errorMessage || 'Verification error';
    switch (errorCode) {
      case '7112':
        return 'Empty OTP provided';
      case '7115':
        return 'OTP is already verified';
      case '7118':
        return 'Incorrect OTP';
      case '7303':
        return 'OTP has expired';
      case '4000':
        return 'Invalid request parameters';
      case '9100':
      case '9103':
      case '9104':
        return 'Network error. Please check your connection';
      default:
        return errorMessage;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>UrbanBook Login</Text>
      {!authMethod && (
        <>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => setAuthMethod('phone')}
          >
            <Text style={styles.authButtonText}>Login with Phone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => setAuthMethod('email')}
          >
            <Text style={styles.authButtonText}>Login with Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => {
              setAuthMethod('GMAIL');
              startOAuth('GMAIL');
            }}
          >
            <Text style={styles.authButtonText}>Sign in with Gmail</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => {
              setAuthMethod('WHATSAPP');
              startOAuth('WHATSAPP');
            }}
          >
            <Text style={styles.authButtonText}>Sign in with WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => {
              setAuthMethod('APPLE');
              startOAuth('APPLE');
            }}
          >
            <Text style={styles.authButtonText}>Sign in with Apple</Text>
          </TouchableOpacity>
        </>
      )}
      {authMethod === 'phone' && !isOtpSent && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Country Code (e.g., +91)"
            value={countryCode}
            onChangeText={setCountryCode}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />
          <Button title="Send OTP" onPress={startPhoneAuth} />
          <Button title="Back" onPress={resetForm} color="gray" />
        </>
      )}
      {authMethod === 'email' && !isOtpSent && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Button title="Send OTP" onPress={startEmailAuth} />
          <Button title="Back" onPress={resetForm} color="gray" />
        </>
      )}
      {isOtpSent && (authMethod === 'phone' || authMethod === 'email') && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            value={otp}
            onChangeText={setOtp}
            keyboardType="numeric"
          />
          <Button title="Verify OTP" onPress={verifyOtp} />
          <Button
            title="Back"
            onPress={() => {
              setIsOtpSent(false);
              setOtp('');
            }}
            color="gray"
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 10,
  },
  authButton: {
    width: '100%',
    padding: 15,
    backgroundColor: '#007AFF',
    borderRadius: 5,
    marginBottom: 10,
    alignItems: 'center',
  },
  authButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default App;