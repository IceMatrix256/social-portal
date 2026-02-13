import { useState, useEffect } from "react";
import { polycentricManager } from "../lib/polycentric/manager";
import {
    getAccessibilitySettings,
    saveAccessibilitySettings,
    type AccessibilitySettings,
    type ThemeMode,
} from "../lib/accessibility";
import {
    Shield, LogOut, Trash2, Key, Sun, Moon, Eye, Type,
    ChevronRight, AlertTriangle, User
} from "lucide-react";

// ── Settings Section Component ────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">{title}</h2>
            <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl overflow-hidden divide-y divide-zinc-800/40">
                {children}
            </div>
        </div>
    );
}

function SettingsRow({ icon: Icon, label, description, children, danger = false }: {
    icon: React.ElementType;
    label: string;
    description?: string;
    children?: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-5 h-5 flex-shrink-0 ${danger ? 'text-red-400' : 'text-zinc-400'}`} />
                <div className="min-w-0">
                    <span className={`text-sm block ${danger ? 'text-red-400' : 'text-zinc-200'}`}>{label}</span>
                    {description && (
                        <span className="text-xs text-zinc-500 block mt-0.5">{description}</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {children}
            </div>
        </div>
    );
}

// ── Toggle Switch ─────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-indigo-600' : 'bg-zinc-700'
                }`}
        >
            <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    );
}

// ── Segment Picker ────────────────────────────────────────────────

function SegmentPicker<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string; icon?: React.ElementType }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex bg-zinc-800/60 rounded-lg p-0.5 gap-0.5">
            {options.map(opt => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                    >
                        {opt.icon && <opt.icon className="w-3.5 h-3.5" />}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Main Settings Page ────────────────────────────────────────────

export function Settings() {
    const [systemKey, setSystemKey] = useState<string>("Loading…");
    const [username, setUsername] = useState<string>("Unknown");
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [a11y, setA11y] = useState<AccessibilitySettings>(getAccessibilitySettings);

    useEffect(() => {
        function loadIdentity() {
            setUsername(polycentricManager.username || 'Unknown');
            const key = polycentricManager.systemKey;
            setSystemKey(key || 'No identity loaded');
        }
        loadIdentity();
    }, []);

    const updateA11y = (patch: Partial<AccessibilitySettings>) => {
        const next = { ...a11y, ...patch };
        setA11y(next);
        saveAccessibilitySettings(next);
    };

    const handleLogOut = async () => {
        await polycentricManager.deleteIdentity();
        window.location.href = '/identity';
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-zinc-100">
                    Settings
                </h1>
                <p className="text-zinc-500 mt-1">Manage your identity and display preferences</p>
            </div>

            {/* Identity Section */}
            <SettingsSection title="Identity">
                <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4 m-4">
                    <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-yellow-200 mb-1">Privacy Notice</h4>
                            <p className="text-sm text-yellow-300/90">
                                Your private keys and bookmarks are stored locally in your browser. 
                                Anyone with physical access to this device or malicious browser extensions could access them.
                                For maximum privacy, use a dedicated browser profile or Incognito/Private Browsing mode.
                            </p>
                        </div>
                    </div>
                </div>
                <SettingsRow icon={User} label="Display Name">
                    <span className="text-sm text-zinc-400">{username}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                </SettingsRow>
                <SettingsRow icon={Key} label="System Key">
                    <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px] block" title={systemKey}>
                        {systemKey.length > 30 ? systemKey.substring(0, 30) + '…' : systemKey}
                    </span>
                </SettingsRow>
                <SettingsRow icon={Shield} label="Protocol">
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                        Polycentric
                    </span>
                </SettingsRow>
            </SettingsSection>

            {/* Accessibility Section */}
            <SettingsSection title="Accessibility">
                <SettingsRow
                    icon={a11y.theme === 'dark' ? Moon : Sun}
                    label="Theme"
                    description="Switch between dark and daylight modes"
                >
                    <SegmentPicker<ThemeMode>
                        options={[
                            { value: 'dark', label: 'Dark', icon: Moon },
                            { value: 'light', label: 'Daylight', icon: Sun },
                        ]}
                        value={a11y.theme}
                        onChange={(theme) => updateA11y({ theme })}
                    />
                </SettingsRow>

                <SettingsRow
                    icon={Eye}
                    label="High Visibility"
                    description="Boost contrast and slightly enlarge text for easier reading"
                >
                    <Toggle
                        checked={a11y.highVisibility}
                        onChange={(highVisibility) => updateA11y({ highVisibility })}
                    />
                </SettingsRow>

                <SettingsRow
                    icon={Type}
                    label="Hyperlegible Font"
                    description="Use Atkinson Hyperlegible — designed for low-vision and ADHD readers"
                >
                    <Toggle
                        checked={a11y.atkinsonFont}
                        onChange={(atkinsonFont) => updateA11y({ atkinsonFont })}
                    />
                </SettingsRow>
            </SettingsSection>

            {/* Danger Zone */}
            <div className="mb-8">
                <button
                    onClick={() => setShowDangerZone(!showDangerZone)}
                    className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-2 mb-3 transition-colors"
                >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Danger Zone</span>
                    <ChevronRight className={`w-3 h-3 transition-transform ${showDangerZone ? 'rotate-90' : ''}`} />
                </button>

                {showDangerZone && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl overflow-hidden">
                        <button
                            onClick={handleLogOut}
                            className="w-full flex items-center gap-3 px-5 py-4 text-red-400 hover:bg-red-500/10 transition-colors text-left"
                        >
                            <LogOut className="w-5 h-5" />
                            <div>
                                <span className="text-sm font-medium block">Log Out</span>
                                <span className="text-xs text-red-400/60">Clear local identity and return to login</span>
                            </div>
                        </button>
                        <div className="border-t border-red-500/10" />
                        <button
                            onClick={() => {
                                if (confirm("This will permanently delete your identity. Are you sure?")) {
                                    handleLogOut();
                                }
                            }}
                            className="w-full flex items-center gap-3 px-5 py-4 text-red-400 hover:bg-red-500/10 transition-colors text-left"
                        >
                            <Trash2 className="w-5 h-5" />
                            <div>
                                <span className="text-sm font-medium block">Delete Identity</span>
                                <span className="text-xs text-red-400/60">Remove all local data and keys permanently</span>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* App Info */}
            <div className="text-center text-zinc-600 text-xs py-4 border-t border-zinc-800/30">
                <p>Social Portal v0.1.0 — Built with Polycentric Protocol</p>
                <p className="mt-1">Your data stays on your device. No tracking. No ads.</p>
            </div>
        </div>
    );
}
