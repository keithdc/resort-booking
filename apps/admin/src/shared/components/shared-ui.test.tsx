// @vitest-environment jsdom
/**
 * @file apps/admin/src/shared/components/shared-ui.test.tsx
 * @shared Page header, section card, empty state, status chip, icon chip, avatar
 */

import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';
import { IconChip } from './icon-chip';
import { PageHeader } from './page-header';
import { SectionCard } from './section-card';
import { StatusChip } from './status-chip';
import { UserAvatar } from './user-avatar';

describe('PageHeader', () => {
  afterEach(cleanup);

  it('has the title as the one h1, with help text, badges and actions', () => {
    render(
      <PageHeader
        icon={<InboxOutlinedIcon />}
        title="Refunds"
        description="Money to send back."
        badges={<span>On the website</span>}
        actions={<button type="button">Add</button>}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Refunds' })).toBeTruthy();
    expect(screen.getByText('Money to send back.')).toBeTruthy();
    expect(screen.getByText('On the website')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('works with only an icon and a title', () => {
    render(<PageHeader icon={<InboxOutlinedIcon />} title="Calendar" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeTruthy();
  });
});

describe('SectionCard', () => {
  afterEach(cleanup);

  it('is a named region with its eyebrow, title, help, action and content', () => {
    render(
      <SectionCard icon={<InboxOutlinedIcon />} eyebrow="1 · Sign in" title="Your staff login" description="Name and email." action={<button type="button">Edit</button>}>
        <p>inside</p>
      </SectionCard>,
    );

    expect(screen.getByRole('region', { name: 'Your staff login' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Your staff login' })).toBeTruthy();
    expect(screen.getByText('1 · Sign in')).toBeTruthy();
    expect(screen.getByText('Name and email.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('can be a level-3 heading inside another section', () => {
    render(
      <SectionCard icon={<InboxOutlinedIcon />} title="Inner" level={3}>
        x
      </SectionCard>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Inner' })).toBeTruthy();
  });
});

describe('EmptyState', () => {
  afterEach(cleanup);

  it('says what is missing, what to do, and offers an action', () => {
    render(<EmptyState icon={<InboxOutlinedIcon />} title="No refunds here." hint="Try another filter." action={<button type="button">Reset</button>} />);

    expect(screen.getByText('No refunds here.')).toBeTruthy();
    expect(screen.getByText('Try another filter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('needs only a title', () => {
    render(<EmptyState icon={<InboxOutlinedIcon />} title="Nothing yet" />);

    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });
});

describe('StatusChip', () => {
  afterEach(cleanup);

  it('shows the words, with an icon', () => {
    const { container } = render(<StatusChip status={{ label: 'Cancelled', tone: 'error', icon: 'cancelled' }} />);

    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('can show other words than the status default', () => {
    render(<StatusChip status={{ label: 'Booked', tone: 'success', icon: 'booked' }} label="Staying now" />);

    expect(screen.getByText('Staying now')).toBeTruthy();
    expect(screen.queryByText('Booked')).toBeNull();
  });

  it('has an icon for every status key', () => {
    for (const icon of ['booked', 'in-house', 'checked-out', 'rebook', 'hold', 'cancelled', 'expired', 'refund-done', 'refund-pending', 'refund-failed'] as const) {
      const { container, unmount } = render(<StatusChip status={{ label: icon, tone: 'default', icon }} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });
});

describe('IconChip and UserAvatar', () => {
  afterEach(cleanup);

  it('hides the decorative icon tile from screen readers', () => {
    const { container } = render(<IconChip icon={<InboxOutlinedIcon />} tone="success" />);

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the initials, and the same person looks the same', () => {
    const first = render(<UserAvatar name="Marie Dupont" />);
    expect(screen.getByText('MD')).toBeTruthy();
    const firstClass = first.container.firstElementChild?.className;
    first.unmount();

    const second = render(<UserAvatar name="Marie Dupont" />);
    expect(second.container.firstElementChild?.className).toBe(firstClass);
  });
});
