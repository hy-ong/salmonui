import { Avatar, AvatarGroup } from '@salmonui/layout/avatar';
import { Badge } from '@salmonui/notifications/badge';

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra', 'Barbara Liskov'];

// An inline SVG portrait (no network request); a real app passes a photo URL.
const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2f6f8f"/><circle cx="32" cy="25" r="12" fill="#f3d9c4"/><path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill="#f3d9c4"/></svg>')}`;
// Not a decodable image: the <img> fires `error` and the initials show instead.
const BROKEN = 'data:image/png;base64,AAAA';

export default function AvatarDemo() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
          <Avatar key={size} name="Ada Lovelace" size={size} />
        ))}
      </div>
      <div className="demo-toolbar">
        {(['neutral', 'primary', 'info', 'success', 'warning', 'danger'] as const).map((tone) => (
          <Avatar key={tone} name={tone} tone={tone} shape="circle" />
        ))}
        {(['neutral', 'primary', 'success'] as const).map((tone) => (
          <Avatar key={`solid-${tone}`} name={`${tone} solid`} tone={tone} variant="solid" shape="circle" />
        ))}
        <Avatar alt="Robot" fallback={<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor" /></svg>} />
      </div>
      <div className="demo-toolbar">
        <Avatar src={PHOTO} alt="Grace Hopper" name="Grace Hopper" shape="circle" size="lg" />
        <Avatar src={PHOTO} alt="Alan Turing" name="Alan Turing" size="lg" />
        <Avatar src={BROKEN} alt="Edsger Dijkstra" name="Edsger Dijkstra" shape="circle" size="lg" />
      </div>
      <AvatarGroup max={3} size="sm" aria-label="Reviewers">
        {PEOPLE.map((name) => (
          <Avatar key={name} name={name} shape="circle" size="sm" />
        ))}
      </AvatarGroup>
      <div className="demo-toolbar">
        <Badge content={3} overlap="circular" label="3 unread messages">
          <Avatar name="Ada Lovelace" shape="circle" size="lg" />
        </Badge>
        <Badge dot overlap="circular" placement="bottomEnd" tone="success" label="Online">
          <Avatar name="Grace Hopper" shape="circle" size="lg" />
        </Badge>
      </div>
    </div>
  );
}
