import React from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import {
  AiProvider,
  HealthSource,
  PROVIDER_ORDER,
  PROVIDERS,
  useAppStore,
} from '../../state/useAppStore';
import { monoFont, radii, useTheme } from '../../theme/theme';

const CONNECTIONS: {
  key: HealthSource;
  name: string;
  detail: string;
  icon: 'googleHealth' | 'appleHealth';
  logoColorKey: 'logoBlue' | 'logoRed';
}[] = [
  {
    key: 'googleHealth',
    name: 'Google Health',
    detail: 'steps, activities, heart rate',
    icon: 'googleHealth',
    logoColorKey: 'logoBlue',
  },
  {
    key: 'appleHealth',
    name: 'Apple Health',
    detail: 'sleep, HRV, RHR',
    icon: 'appleHealth',
    logoColorKey: 'logoRed',
  },
];

/** Settings: health data connections and AI coach provider configuration. */
export function SettingsScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const { aiProvider, model, apiKey, connections } = useAppStore();
  const setAiProvider = useAppStore(s => s.setAiProvider);
  const setModel = useAppStore(s => s.setModel);
  const setApiKey = useAppStore(s => s.setApiKey);
  const toggleConnection = useAppStore(s => s.toggleConnection);
  const provider = PROVIDERS[aiProvider];
  const isOnDevice = aiProvider === 'ondevice';

  return (
    <Screen>
      <DetailHeader
        title="Settings"
        subtitle="Connections & AI coach"
        onBack={() => navigation.goBack()}
      />

      <SectionLabel>Health data sources</SectionLabel>
      <Card>
        {CONNECTIONS.map((conn, i) => {
          const on = connections[conn.key];
          return (
            <View
              key={conn.key}
              style={[
                styles.conn,
                i > 0 && {
                  borderTopColor: t.colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View
                style={[
                  styles.logo,
                  { backgroundColor: t.colors[conn.logoColorKey] },
                ]}
              >
                <Icon
                  name={conn.icon}
                  size={20}
                  color="#fff"
                  strokeWidth={1.9}
                />
              </View>
              <View style={styles.connText}>
                <Text style={[styles.connName, { color: t.colors.fg }]}>
                  {conn.name}
                </Text>
                <View style={styles.connStatusRow}>
                  <View
                    style={[
                      styles.stDot,
                      { backgroundColor: on ? t.colors.rec : t.colors.faint },
                    ]}
                  />
                  <Text style={[styles.connStatus, { color: t.colors.muted }]}>
                    {on ? `Connected · ${conn.detail}` : 'Not connected'}
                  </Text>
                </View>
              </View>
              <Switch
                value={on}
                onValueChange={() => toggleConnection(conn.key)}
                trackColor={{ true: t.colors.accent, false: t.colors.border }}
                thumbColor="#fff"
                accessibilityLabel={`${conn.name} connection`}
              />
            </View>
          );
        })}
      </Card>
      <Text style={[styles.dinfo, { color: t.colors.muted }]}>
        Google Health is your primary source — steps and activities from it
        auto-fill your weekly goals.
      </Text>

      <SectionLabel>AI coach provider</SectionLabel>
      <Card>
        <View style={styles.prov}>
          {PROVIDER_ORDER.map(key => (
            <ProviderOption
              key={key}
              providerKey={key}
              selected={key === aiProvider}
              onSelect={() => setAiProvider(key)}
            />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { color: t.colors.muted }]}>
          API key
        </Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          editable={!isOnDevice}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={isOnDevice ? 'No key needed' : provider.keyPlaceholder}
          placeholderTextColor={t.colors.faint}
          style={[
            styles.input,
            {
              color: t.colors.fg,
              backgroundColor: t.colors.surface2,
              borderColor: t.colors.border,
            },
            isOnDevice && { opacity: 0.5 },
          ]}
        />

        <Text
          style={[styles.fieldLabel, { color: t.colors.muted, marginTop: 14 }]}
        >
          Model
        </Text>
        <View style={styles.modelRow}>
          {provider.models.map(m => {
            const on = m === model;
            return (
              <Pressable
                key={m}
                onPress={() => setModel(m)}
                style={[
                  styles.modelPill,
                  {
                    backgroundColor: on
                      ? t.colors.accentSoft
                      : t.colors.surface2,
                    borderColor: on ? t.colors.accent : t.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modelText,
                    { color: on ? t.colors.accent : t.colors.fg },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Text style={[styles.dinfo, { color: t.colors.muted }]}>
        Your key is stored on-device and used only for coach messages.
      </Text>
    </Screen>
  );
}

function ProviderOption({
  providerKey,
  selected,
  onSelect,
}: {
  providerKey: AiProvider;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  const p = PROVIDERS[providerKey];
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.provOpt,
        {
          borderColor: selected ? t.colors.accent : t.colors.border,
          backgroundColor: selected ? t.colors.accentSoft : t.colors.surface,
        },
      ]}
    >
      <View style={[styles.provPic, { backgroundColor: t.colors.surface2 }]}>
        <Icon
          name={p.icon}
          size={18}
          color={selected ? t.colors.accent : t.colors.fg}
        />
      </View>
      <View style={styles.provText}>
        <Text style={[styles.provName, { color: t.colors.fg }]}>{p.name}</Text>
        <Text style={[styles.provTagline, { color: t.colors.muted }]}>
          {p.tagline}
        </Text>
      </View>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? t.colors.accent : t.colors.border },
        ]}
      >
        {selected && (
          <View
            style={[styles.radioDot, { backgroundColor: t.colors.accent }]}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  conn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connText: { flex: 1, minWidth: 0 },
  connName: { fontSize: 14, fontWeight: '700' },
  connStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  stDot: { width: 7, height: 7, borderRadius: 3.5 },
  connStatus: { fontSize: 11.5 },
  dinfo: { fontSize: 11, lineHeight: 16, marginTop: 14, paddingHorizontal: 2 },
  prov: { gap: 10, marginBottom: 16 },
  provOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 15,
  },
  provPic: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  provText: { flex: 1, minWidth: 0 },
  provName: { fontSize: 13.5, fontWeight: '700' },
  provTagline: { fontSize: 11, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  fieldLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
  },
  modelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modelPill: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  modelText: { fontSize: 13, fontWeight: '700' },
});
