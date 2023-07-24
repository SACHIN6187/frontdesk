import type { Role } from '../types';

const LABEL: Record<Role, string> = {
  owner: 'Owner',
  agent: 'Agent',
  viewer: 'Viewer',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`badge badge-role badge-role--${role}`}>{LABEL[role]}</span>
  );
}
