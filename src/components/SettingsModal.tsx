import React, { useState } from 'react';
import { X, Save, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';
import { AppConfig } from '../types/ipc';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
  onClearCredentials: () => Promise<void>;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onSave,
  onClearCredentials,
  onClose,
}) => {
  const [formData, setFormData] = useState<AppConfig>(config);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (field: keyof AppConfig, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSave(formData);
      setSaveStatus('Settings saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Error saving settings');
    }
  };

  const handlePurge = async () => {
    try {
      await onClearCredentials();
      setPurgeStatus('Saved credentials purged from Windows Credential Manager');
      setTimeout(() => setPurgeStatus(null), 3000);
    } catch {
      setPurgeStatus('No stored credentials or purge failed');
    }
  };

  const handleRestoreDefaults = () => {
    setFormData({
      remote_host: '192.168.68.100',
      remote_port: 22,
      remote_user: 'ali',
      private_key_path: 'C:\\Users\\sufya\\.ssh\\wds_mac_ed25519',
      heartbeat_interval_secs: 15,
      connection_timeout_secs: 10,
      identity_check_command: 'uname -srm; sw_vers -productVersion 2>/dev/null || true',
      save_password_to_keyring: false,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-sm max-h-[540px] flex flex-col bg-[#1e222b] border border-[#262c36] rounded-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-[#262c36] bg-[#161920]">
          <h2 id="settings-title" className="text-sm font-bold text-slate-100">
            Connection Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-4 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 text-xs">
          {/* Target Host & Port */}
          <div className="space-y-1.5">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Remote Target
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label htmlFor="set-host" className="text-slate-400 block mb-1">Host IP / Name</label>
                <input
                  id="set-host"
                  type="text"
                  value={formData.remote_host}
                  onChange={(e) => handleChange('remote_host', e.target.value)}
                  className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="set-port" className="text-slate-400 block mb-1">Port</label>
                <input
                  id="set-port"
                  type="number"
                  value={formData.remote_port}
                  onChange={(e) => handleChange('remote_port', parseInt(e.target.value) || 22)}
                  className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-user" className="text-slate-400 block mb-1">SSH User</label>
              <input
                id="set-user"
                type="text"
                value={formData.remote_user}
                onChange={(e) => handleChange('remote_user', e.target.value)}
                className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Private Key Path */}
          <div className="space-y-1.5 pt-2 border-t border-[#262c36]">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Authentication
            </span>
            <div>
              <label htmlFor="set-key" className="text-slate-400 block mb-1">Private Key Path</label>
              <input
                id="set-key"
                type="text"
                value={formData.private_key_path}
                onChange={(e) => handleChange('private_key_path', e.target.value)}
                className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono text-[11px] focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Heartbeat & Timeout */}
          <div className="space-y-1.5 pt-2 border-t border-[#262c36]">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Health Monitoring
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="set-hb" className="text-slate-400 block mb-1">Heartbeat (sec)</label>
                <input
                  id="set-hb"
                  type="number"
                  value={formData.heartbeat_interval_secs}
                  onChange={(e) => handleChange('heartbeat_interval_secs', parseInt(e.target.value) || 15)}
                  className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="set-to" className="text-slate-400 block mb-1">Timeout (sec)</label>
                <input
                  id="set-to"
                  type="number"
                  value={formData.connection_timeout_secs}
                  onChange={(e) => handleChange('connection_timeout_secs', parseInt(e.target.value) || 10)}
                  className="w-full h-9 bg-[#12141a] border border-[#262c36] rounded px-2 text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Credential Store Management */}
          <div className="space-y-2 pt-2 border-t border-[#262c36]">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Credential Storage
            </span>
            <button
              type="button"
              onClick={handlePurge}
              className="w-full py-2 px-3 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Purge Stored Password from Keyring</span>
            </button>
            {purgeStatus && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {purgeStatus}
              </p>
            )}
          </div>

          {/* Form Actions (44px min height) */}
          <div className="pt-3 border-t border-[#262c36] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="h-10 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Defaults</span>
            </button>

            <button
              type="submit"
              className="flex-1 h-11 min-h-[44px] rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Save className="w-4 h-4 text-slate-950" />
              <span>Save Settings</span>
            </button>
          </div>
          {saveStatus && (
            <p className="text-center text-xs text-sky-300">{saveStatus}</p>
          )}
        </form>
      </div>
    </div>
  );
};
