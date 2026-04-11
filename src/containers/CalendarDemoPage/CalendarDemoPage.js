/**
 * CalendarDemoPage
 * ────────────────
 * Public route /calendar-demo. Renders the PoolCalendar with mock data so
 * visitors (and the host team) can see the flagship smart calendar without
 * needing to be logged in or own a listing.
 *
 * This is a demo-only container — not linked from the main nav.
 */

import React, { useState } from 'react';
import { useConfiguration } from '../../context/configurationContext';
import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import PoolCalendar from '../../components/PoolCalendar';

// ── Mock listing ─────────────────────────────────────────────────────────
const buildMockListing = () => ({
  id: { uuid: 'demo-listing-0001' },
  type: 'listing',
  attributes: {
    title: 'Heated Saltwater Pool · Austin, TX',
    publicData: {
      location: { address: '1234 Barton Springs Rd, Austin, TX 78704, USA' },
      poolType: 'inground',
      heated: true,
      externalCalendarUrls: [],
    },
    availabilityPlan: {
      type: 'availability-plan/time',
      timezone: 'America/Chicago',
      entries: [
        { dayOfWeek: 'mon', startTime: '10:00', endTime: '20:00', seats: 1 },
        { dayOfWeek: 'tue', startTime: '10:00', endTime: '20:00', seats: 1 },
        { dayOfWeek: 'wed', startTime: '10:00', endTime: '20:00', seats: 1 },
        { dayOfWeek: 'thu', startTime: '10:00', endTime: '20:00', seats: 1 },
        { dayOfWeek: 'fri', startTime: '10:00', endTime: '22:00', seats: 1 },
        { dayOfWeek: 'sat', startTime: '09:00', endTime: '22:00', seats: 1 },
        { dayOfWeek: 'sun', startTime: '09:00', endTime: '20:00', seats: 1 },
      ],
    },
  },
});

// ── Mock availability exceptions (blocked dates) ─────────────────────────
const buildMockExceptions = () => {
  const today = new Date();
  const mk = (offsetStart, offsetEnd, seats = 0) => {
    const start = new Date(today);
    start.setDate(start.getDate() + offsetStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + offsetEnd);
    end.setHours(0, 0, 0, 0);
    return {
      id: { uuid: `mock-ex-${offsetStart}-${offsetEnd}` },
      type: 'availabilityException',
      attributes: { start, end, seats },
    };
  };
  return [
    mk(3, 5),    // blocked 3 days from now → 5 days
    mk(10, 12),  // blocked 10 days → 12
    mk(18, 21),  // blocked 18 days → 21
  ];
};

// ── Wrap the mock exception with .id string so PoolCalendar can delete ──
const normalizeException = ex => ({
  ...ex,
  id: ex.id.uuid,
});

const CalendarDemoPage = () => {
  const config = useConfiguration();
  const [mockListing] = useState(buildMockListing());
  const [exceptions, setExceptions] = useState(
    buildMockExceptions().map(normalizeException)
  );

  // Mock handlers — just update local state so the demo feels real
  const handleAdd = ({ seats, start, end }) => {
    const newEx = {
      id: `mock-ex-${Date.now()}`,
      type: 'availabilityException',
      attributes: { start, end, seats },
    };
    setExceptions(prev => [...prev, newEx]);
    return Promise.resolve();
  };

  const handleDelete = exId => {
    setExceptions(prev => prev.filter(e => e.id !== exId));
    return Promise.resolve();
  };

  return (
    <Page
      title="Calendar Demo · Pool Rental Near Me"
      description="Smart pool availability calendar with AI demand forecasting and external calendar sync."
      scrollingDisabled={false}
    >
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '40px 24px 80px',
          }}
        >
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#d4af37',
                marginBottom: 10,
              }}
            >
              Live Demo
            </div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 44,
                fontWeight: 500,
                color: '#f7f1df',
                margin: '0 0 10px',
              }}
            >
              The Smart Calendar
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: 'rgba(247, 241, 223, 0.6)',
                margin: 0,
                maxWidth: 560,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Drag dates to block. Toggle AI Demand to see predicted hot days.
              Click Sync to connect Google Calendar, Airbnb, VRBO, or Apple Calendar.
            </p>
          </div>

          <PoolCalendar
            listing={mockListing}
            allExceptions={exceptions}
            onAddAvailabilityException={handleAdd}
            onDeleteAvailabilityException={handleDelete}
            config={config}
          />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default CalendarDemoPage;
