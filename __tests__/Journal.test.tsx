import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import {
  deleteJournalDay,
  upsertJournalDay,
} from '../src/db/journalRepository';
import { JournalCard } from '../src/features/journal/JournalCard';
import { JournalScreen } from '../src/features/journal/JournalScreen';
import { startOfLocalDay } from '../src/health';
import { JournalDay, JournalTagKey } from '../src/state/journal';
import { saveJournalDay } from '../src/state/journalService';
import { useJournalStore } from '../src/state/useJournalStore';

jest.mock('../src/db/journalRepository', () => ({
  loadJournal: jest.fn().mockResolvedValue([]),
  upsertJournalDay: jest.fn().mockResolvedValue(undefined),
  deleteJournalDay: jest.fn().mockResolvedValue(undefined),
}));

const today = startOfLocalDay(Date.now());
/** Local midnight `n` days before today. */
function ago(n: number): number {
  let d = today;
  for (let i = 0; i < n; i++) d = startOfLocalDay(d - 1);
  return d;
}
function entry(
  d: number,
  tags: JournalTagKey[],
  extra: Partial<JournalDay> = {},
): JournalDay {
  return { day: d, tags, ended: [], note: '', updatedAt: 0, ...extra };
}
const todays = () =>
  useJournalStore.getState().entries.find(e => e.day === today);

beforeEach(() => {
  jest.clearAllMocks();
  useJournalStore.setState({ entries: [], hydrated: true });
});

describe('saveJournalDay', () => {
  it('deletes a day that ends up empty instead of storing a blank row', async () => {
    useJournalStore.setState({ entries: [entry(today, ['alcohol'])] });
    await saveJournalDay({ day: today, tags: [], note: '  ' });
    expect(deleteJournalDay).toHaveBeenCalledWith(today);
    expect(useJournalStore.getState().entries).toEqual([]);
  });

  it('never stores a condition as both current and ended', async () => {
    await saveJournalDay({
      day: today,
      tags: ['sick'],
      ended: ['sick', 'injured'],
    });
    expect(upsertJournalDay).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['sick'], ended: ['injured'] }),
    );
  });
});

describe('JournalCard (Today)', () => {
  it('asks about yesterday’s sickness and records "still sick"', async () => {
    useJournalStore.setState({ entries: [entry(ago(1), ['sick'])] });
    await renderWithProviders(<JournalCard navigation={mockNav()} />);
    expect(screen.getByText('Still sick?')).toBeOnTheScreen();
    expect(screen.getByText(/this would be day 2/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Still sick'));
    expect(todays()?.tags).toEqual(['sick']);
    expect(screen.queryByText('Still sick?')).toBeNull();
    // The chip now carries the stretch's day number.
    expect(screen.getByText('Sick · day 2')).toBeOnTheScreen();
  });

  it('"I’m better" ends it, and Today stops asking', async () => {
    useJournalStore.setState({ entries: [entry(ago(1), ['injured'])] });
    await renderWithProviders(<JournalCard navigation={mockNav()} />);
    await fireEvent.press(screen.getByText('I’m better'));
    expect(todays()).toMatchObject({ tags: [], ended: ['injured'] });
    expect(screen.queryByText('Still injured?')).toBeNull();
  });

  it('toggles quick tags on today and opens the full journal', async () => {
    const nav = mockNav();
    await renderWithProviders(<JournalCard navigation={nav} />);
    expect(screen.getByText('How’s today going?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Alcohol'));
    expect(todays()?.tags).toEqual(['alcohol']);
    expect(screen.getByLabelText('Alcohol')).toBeChecked();
    await fireEvent.press(screen.getByLabelText('More journal tags'));
    expect(nav.navigate).toHaveBeenCalledWith('Journal');
  });
});

describe('JournalScreen', () => {
  it('pre-selects an open sickness; leaving it off records that it ended', async () => {
    useJournalStore.setState({
      entries: [entry(ago(2), ['sick']), entry(ago(1), ['sick'])],
    });
    const nav = mockNav();
    await renderWithProviders(<JournalScreen navigation={nav} />);
    expect(screen.getByLabelText('Sick')).toBeChecked();
    expect(screen.getByText('day 3')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Sick'));
    await fireEvent.press(screen.getByLabelText('Late caffeine'));
    await fireEvent.changeText(
      screen.getByLabelText('Journal note'),
      ' Felt fine ',
    );
    await fireEvent.press(screen.getByLabelText('Save journal'));
    expect(todays()).toMatchObject({
      tags: ['lateCaffeine'],
      ended: ['sick'],
      note: 'Felt fine',
    });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('keeps an open sickness when today already has another tag', async () => {
    useJournalStore.setState({
      entries: [entry(ago(1), ['sick']), entry(today, ['alcohol'])],
    });
    await renderWithProviders(<JournalScreen navigation={mockNav()} />);
    expect(screen.getByLabelText('Sick')).toBeChecked();
    expect(screen.getByLabelText('Alcohol')).toBeChecked();
    await fireEvent.press(screen.getByLabelText('Save journal'));
    expect(todays()).toMatchObject({ tags: ['alcohol', 'sick'], ended: [] });
  });

  it('edits a past day from the strip without touching today', async () => {
    await renderWithProviders(<JournalScreen navigation={mockNav()} />);
    expect(screen.getByLabelText('Save journal')).toBeDisabled();
    const d = new Date(ago(2));
    const name = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}`;
    await fireEvent.press(screen.getByLabelText(name));
    await fireEvent.press(screen.getByLabelText('Stressed'));
    expect(screen.getByText(`Save ${name}`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Save journal'));
    await waitFor(() =>
      expect(useJournalStore.getState().entries).toEqual([
        expect.objectContaining({ day: ago(2), tags: ['stressed'] }),
      ]),
    );
  });

  it('explains the insights until there’s enough data', async () => {
    await renderWithProviders(<JournalScreen navigation={mockNav()} />);
    expect(screen.getByText(/after 3 tagged days with data/)).toBeOnTheScreen();
  });
});
