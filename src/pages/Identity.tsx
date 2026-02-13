import { useState, useEffect } from 'react';
import { polycentricManager, type IdentityInfo } from '../lib/polycentric/manager';
import {
    ShieldCheck, Fingerprint, Key, CheckCircle2,
    Copy, Download, Upload, Plus, Pencil, AlertTriangle
} from 'lucide-react';

// ── Utils ────────────────────────────────────────────────────────────

function generateAvatar(seed: string) {
    // Generate a consistent color from the seed string
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    const color = `hsl(${hue}, 70%, 60%)`;

    // Simple SVG avatar
    return `data:image/svg+xml;utf8,
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="${color}" />
            <text x="50" y="50" font-family="sans-serif" font-size="50" font-weight="bold" fill="white" text-anchor="middle" dy=".35em">
                ${seed.charAt(0).toUpperCase()}
            </text>
        </svg>`
        .replace(/\n/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Modals & Components ──────────────────────────────────────────────

function ExportModal({ onClose }: { onClose: () => void }) {
    const [backupStr, setBackupStr] = useState<string | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        polycentricManager.exportIdentity().then(async (str) => {
            setBackupStr(str);
            if (str) {
                try {
                    const QRCode = await import('qrcode');
                    const dataUrl = await QRCode.toDataURL(str, {
                        width: 280,
                        margin: 2,
                        color: { dark: '#ffffffFF', light: '#00000000' },
                        errorCorrectionLevel: 'L',
                    });
                    setQrDataUrl(dataUrl);
                } catch (e) {
                    console.warn("QR generation failed:", e);
                }
            }
        });
    }, []);

    const handleCopy = () => {
        if (backupStr) {
            navigator.clipboard.writeText(backupStr);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6">
                <h3 className="text-xl font-bold mb-2">Export Identity</h3>
                <p className="text-zinc-400 text-sm mb-4">
                    Scan this QR code with <strong>Harbor</strong> or another Polycentric app, or copy the URI below.
                    <br />
                    <span className="text-red-400">⚠ This contains your private key — do not share it publicly!</span>
                </p>

                {backupStr ? (
                    <>
                        {/* QR Code */}
                        {qrDataUrl && (
                            <div className="flex justify-center mb-5">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                                    <img src={qrDataUrl} alt="Export QR Code" className="w-56 h-56" />
                                </div>
                            </div>
                        )}

                        {/* URI String */}
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 mb-6 relative group">
                            <code className="text-xs text-zinc-300 break-all font-mono block max-h-32 overflow-y-auto">
                                {backupStr}
                            </code>
                            <button
                                onClick={handleCopy}
                                className="absolute top-2 right-2 bg-zinc-800 hover:bg-zinc-700 p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy to clipboard"
                            >
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 hover:bg-zinc-800 rounded-lg">Close</button>
                </div>
            </div>
        </div>
    );
}

function EditProfileModal({ currentName, onClose, onSave }: { currentName: string, onClose: () => void, onSave: (name: string) => void }) {
    const [name, setName] = useState(currentName);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6">
                <h3 className="text-xl font-bold mb-4">Edit Profile</h3>
                <div className="mb-6">
                    <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase">Display Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 hover:bg-zinc-800 rounded-lg text-sm">Cancel</button>
                    <button
                        onClick={() => onSave(name)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Views ────────────────────────────────────────────────────────────

function IdentityList({ identities, currentSystem, onSwitch, onAdd }: any) {
    return (
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            <h2 className="hidden md:block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Identities</h2>

            {identities.map((id: IdentityInfo) => (
                <button
                    key={id.system}
                    onClick={() => onSwitch(id.system)}
                    className={`flex items-center gap-3 p-2 rounded-lg text-left transition-colors min-w-[160px] md:min-w-0 ${id.system === currentSystem
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                >
                    <img
                        src={generateAvatar(id.username || id.system)}
                        className="w-8 h-8 rounded-full bg-zinc-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{id.username || 'Unknown'}</div>
                        <div className="text-xs text-zinc-500 truncate" title={id.system}>
                            {id.system.substring(0, 8)}...
                        </div>
                    </div>
                </button>
            ))}

            <button
                onClick={onAdd}
                className="whitespace-nowrap md:whitespace-normal mt-0 md:mt-2 flex items-center gap-2 p-2 text-sm text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors border border-dashed border-indigo-500/30"
            >
                <Plus className="w-4 h-4" />
                <span className="md:inline">Add</span>
            </button>
        </div>
    );
}

// ── Main Controller ──────────────────────────────────────────────────

export function Identity() {
    const [identities, setIdentities] = useState<IdentityInfo[]>([]);
    const [mode, setMode] = useState<'view' | 'create' | 'import'>('view');
    const [loading, setLoading] = useState(false);

    // Mobile Navigation State
    const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

    // Modals
    const [showExport, setShowExport] = useState(false);
    const [showEdit, setShowEdit] = useState(false);

    // Form Inputs
    const [newName, setNewName] = useState("");
    const [importKey, setImportKey] = useState("");

    const currentSystem = polycentricManager.systemKey;
    const currentName = polycentricManager.username;

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        await polycentricManager.init();
        const list = await polycentricManager.listIdentities();
        setIdentities(list);
        if (list.length === 0) {
            setMode('create');
            setMobileView('detail');
        } else if (mode === 'create' || mode === 'import') {
            // If we just finished creating/importing, go to view
            setMode('view');
            setMobileView('detail');
        }
    }

    const handleSwitch = async (system: string) => {
        await polycentricManager.switchIdentity(system);
        await loadData();
        setMode('view');
        setMobileView('detail');
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            await polycentricManager.createIdentity(newName);
            await loadData();
            setMode('view');
            setMobileView('detail');
            setNewName('');
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!importKey.trim()) return;
        setLoading(true);
        try {
            const success = await polycentricManager.importIdentity(importKey);
            if (success) {
                await loadData();
                setMode('view');
                setMobileView('detail');
                setImportKey('');
            } else {
                alert("Import failed. Check your key string.");
                setLoading(false);
            }
        } catch (e) {
            alert("Import failed: " + e);
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (name: string) => {
        await polycentricManager.updateProfile(name);
        setShowEdit(false);
        await loadData();
    };

    // ── Render ───────────────────────────────────────────────────────

    // On mobile, we might want to hide the sidebar if an identity is selected?
    // Or just stack them. Stacking is easier for now.

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] -m-4 md:-m-8">
            {/* Sidebar */}
            <div className={`
                w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 
                flex flex-col gap-2 p-4 bg-zinc-950/80 md:bg-transparent
                ${mobileView === 'list' ? 'block' : 'hidden md:flex'}
            `}>
                <IdentityList
                    identities={identities}
                    currentSystem={currentSystem}
                    onSwitch={handleSwitch}
                    onAdd={() => {
                        setMode('create');
                        setMobileView('detail');
                    }}
                />
            </div>

            {/* Main Content */}
            <div className={`
                flex-1 bg-zinc-950/50 p-4 md:p-8 overflow-y-auto
                ${mobileView === 'detail' ? 'block' : 'hidden md:block'}
            `}>
                {/* Mobile Back Button */}
                <button
                    onClick={() => setMobileView('list')}
                    className="md:hidden mb-4 text-zinc-400 flex items-center gap-2 hover:text-white"
                >
                    <div className="bg-zinc-800 p-1 rounded-full">
                        <Plus className="w-4 h-4 rotate-45" /> {/* Close/Back icon */}
                    </div>
                    <span className="text-sm font-medium">Back to List</span>
                </button>
                {mode === 'view' && currentSystem && (
                    <div className="max-w-2xl">
                        {/* Privacy Warning */}
                        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4 mb-6">
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
                        
                        {/* Profile Header */}
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 mb-8">
                            <div className="w-24 h-24 rounded-full bg-zinc-800 p-1 border-2 border-zinc-700 shrink-0">
                                <img src={generateAvatar(currentName || currentSystem || '?')} className="w-full h-full rounded-full" />
                            </div>
                            <div className="flex-1 pt-2 text-center md:text-left min-w-0 w-full">
                                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 truncate">{currentName}</h1>
                                <div className="flex items-center justify-center md:justify-start gap-2 text-zinc-500 font-mono text-sm bg-zinc-900/50 p-2 rounded-lg w-fit mx-auto md:mx-0 max-w-full">
                                    <Key className="w-4 h-4 shrink-0" />
                                    <span className="truncate" title={currentSystem}>{currentSystem}</span>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(currentSystem || '')}
                                        className="hover:text-white ml-2 shrink-0"
                                    >
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2 w-full md:w-auto justify-center">
                                <button
                                    onClick={() => setShowEdit(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Pencil className="w-4 h-4" />
                                    Edit
                                </button>
                                <button
                                    onClick={() => setShowExport(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Export
                                </button>
                            </div>
                        </div>

                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
                            <h3 className="text-lg font-medium mb-4">Identity Status</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-lg">
                                    <div className="text-zinc-500 text-xs uppercase mb-1">Protocol</div>
                                    <div className="font-medium text-emerald-400 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4" />
                                        Polycentric
                                    </div>
                                </div>
                                <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-lg">
                                    <div className="text-zinc-500 text-xs uppercase mb-1">Storage</div>
                                    <div className="font-medium text-zinc-300">IndexedDB (Level)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {(mode === 'create' || mode === 'import') && (
                    <div className="max-w-md mx-auto py-12">
                        <div className="flex gap-2 mb-8 bg-zinc-900 p-1 rounded-lg">
                            <button
                                onClick={() => setMode('create')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'create' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Create New
                            </button>
                            <button
                                onClick={() => setMode('import')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'import' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Import Existing
                            </button>
                        </div>

                        <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-8">
                            {mode === 'create' ? (
                                <>
                                    <div className="text-center mb-6">
                                        <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Fingerprint className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-bold">New Identity</h2>
                                        <p className="text-zinc-400 text-sm mt-1">Generate a new self-sovereign identity.</p>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Display Name (e.g. Satoshi)"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white mb-4"
                                    />
                                    <button
                                        onClick={handleCreate}
                                        disabled={loading || !newName.trim()}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg"
                                    >
                                        {loading ? 'Generating...' : 'Create Identity'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-center mb-6">
                                        <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-bold">Import Identity</h2>
                                        <p className="text-zinc-400 text-sm mt-1">Paste your backup string below.</p>
                                    </div>
                                    <textarea
                                        placeholder="Paste backup string here..."
                                        value={importKey}
                                        onChange={e => setImportKey(e.target.value)}
                                        className="w-full h-32 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white text-xs font-mono mb-4 resize-none"
                                    />
                                    <button
                                        onClick={handleImport}
                                        disabled={loading || !importKey.trim()}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg"
                                    >
                                        {loading ? 'Importing...' : 'Restore Identity'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showExport && <ExportModal onClose={() => setShowExport(false)} />}
            {showEdit && <EditProfileModal currentName={currentName || ''} onClose={() => setShowEdit(false)} onSave={handleUpdateProfile} />}
        </div>
    );
}
