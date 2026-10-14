import { useEffect, useState } from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import * as Clipboard from 'expo-clipboard';

// Backend base URL. This PC on WiFi is 192.168.29.21 (real device on the
// same WiFi); the Android emulator would use http://10.0.2.2:3000/api/v1,
// the iOS simulator http://localhost:3000/api/v1. Editable in the app.
const DEFAULT_BACKEND_URL = 'http://192.168.29.21:3000/api/v1';

const short = (s, n = 24) =>
  s && s.length > n ? `${s.slice(0, n)}…(${s.length})` : s || '(empty)';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function Copyable({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.mono} selectable>
        {label}: {short(value, 60)}
      </Text>
      <Button
        title="Copy"
        disabled={!value}
        onPress={() => Clipboard.setStringAsync(value || '')}
      />
    </View>
  );
}

export default function App() {
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [otpStatus, setOtpStatus] = useState('idle');
  const [uid, setUid] = useState('');
  const [idToken, setIdToken] = useState('');

  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [backendStatus, setBackendStatus] = useState('idle');
  const [accessToken, setAccessToken] = useState('');
  const [pegwinUser, setPegwinUser] = useState('');

  const [permStatus, setPermStatus] = useState('unknown');
  const [fcmToken, setFcmToken] = useState('');
  const [lastPush, setLastPush] = useState('(none yet)');
  const [pushStatus, setPushStatus] = useState('idle');

  useEffect(() => {
    const unsub = messaging().onMessage(async (msg) => {
      setLastPush(JSON.stringify(msg.notification || msg.data || msg));
    });
    return unsub;
  }, []);

  const sendCode = async () => {
    setOtpStatus('sending…');
    try {
      const c = await auth().signInWithPhoneNumber(phone.trim());
      setConfirm(c);
      setOtpStatus('code sent — enter it below');
    } catch (e) {
      setOtpStatus(`send failed: ${e.message}`);
    }
  };

  const verifyCode = async () => {
    if (!confirm) {
      setOtpStatus('send a code first');
      return;
    }
    setOtpStatus('verifying…');
    try {
      const cred = await confirm.confirm(code.trim());
      const token = await cred.user.getIdToken();
      setUid(cred.user.uid);
      setIdToken(token);
      setOtpStatus('verified ✓');
    } catch (e) {
      setOtpStatus(`verify failed: ${e.message}`);
    }
  };

  const verifyBackend = async () => {
    if (!idToken) {
      setBackendStatus('verify an OTP first (need Firebase ID token)');
      return;
    }
    setBackendStatus('calling backend…');
    try {
      const res = await fetch(`${backendUrl}/auth/firebase/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name: 'Firebase Test' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${(body.error || {}).code || ''} ${(body.error || {}).message || ''}`);
      setAccessToken(body.accessToken);
      setPegwinUser(JSON.stringify(body.user));
      setBackendStatus('backend login ✓');
    } catch (e) {
      setBackendStatus(`backend failed: ${e.message}`);
    }
  };

  const registerDevice = async () => {
    if (!accessToken || !fcmToken) {
      setPushStatus('need Pegwin access token + FCM token first');
      return;
    }
    setPushStatus('registering…');
    try {
      const res = await fetch(`${backendUrl}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: fcmToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${res.status} ${(body.error || {}).code || ''}`);
      setPushStatus(`device registered ✓ (${body.id || 'ok'})`);
    } catch (e) {
      setPushStatus(`register failed: ${e.message}`);
    }
  };

  const fetchFcmToken = async () => {
    setPushStatus('requesting…');
    try {
      const s = await messaging().requestPermission();
      setPermStatus(String(s));
      const token = await messaging().getToken();
      setFcmToken(token);
      setPushStatus('token ready ✓');
    } catch (e) {
      setPushStatus(`push failed: ${e.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="1 · Phone OTP (Firebase)">
          <TextInput style={styles.input} value={phone} onChangeText={setPhone}
            placeholder="+919876543210" keyboardType="phone-pad" autoCapitalize="none" />
          <Button title="Send code" onPress={sendCode} />
          <TextInput style={styles.input} value={code} onChangeText={setCode}
            placeholder="6-digit code" keyboardType="number-pad" />
          <Button title="Confirm code" onPress={verifyCode} />
          <Text style={styles.status}>{otpStatus}</Text>
          <Copyable label="uid" value={uid} />
          <Copyable label="idToken" value={idToken} />
        </Section>

        <Section title="2 · Backend hookup (Pegwin API)">
          <TextInput style={styles.input} value={backendUrl} onChangeText={setBackendUrl}
            placeholder={DEFAULT_BACKEND_URL} autoCapitalize="none" autoCorrect={false} />
          <Button title="Verify with backend" onPress={verifyBackend} />
          <Text style={styles.status}>{backendStatus}</Text>
          <Copyable label="accessToken" value={accessToken} />
          <Text style={styles.mono}>user: {short(pegwinUser, 80)}</Text>
        </Section>

        <Section title="3 · Push (FCM)">
          <Button title="Get FCM token" onPress={fetchFcmToken} />
          <Text style={styles.status}>permission: {permStatus}</Text>
          <Copyable label="fcmToken" value={fcmToken} />
          <Button title="Register device with backend" onPress={registerDevice} />
          <Text style={styles.status}>{pushStatus}</Text>
          <Text style={styles.mono}>last foreground push: {short(lastPush, 200)}</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 4 },
  section: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#bbb', borderRadius: 6,
    padding: 8, marginBottom: 8,
  },
  status: { marginVertical: 6, color: '#333' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
});
