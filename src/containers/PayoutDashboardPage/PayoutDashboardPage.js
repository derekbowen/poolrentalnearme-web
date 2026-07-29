import React, { useEffect, useState, useCallback } from 'react';
import { connect } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { ensureCurrentUser } from '../../util/data';
import { showPaymentDetailsForUser } from '../../util/userHelpers';
import { getPayoutSummary, getPayoutList } from '../../util/api';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  H3,
  IconSpinner,
  NamedLink,
  NamedRedirect,
  Page,
  UserNav,
  LayoutSideNavigation,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import css from './PayoutDashboardPage.module.css';

const PAGE_SIZE = 10;

const formatMoney = (amountCents, currency) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format((amountCents || 0) / 100);

const formatDate = (unixSeconds) =>
  unixSeconds
    ? new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

const STATUS_CLASS = {
  paid: 'statusPaid',
  in_transit: 'statusInTransit',
  pending: 'statusInTransit',
  failed: 'statusFailed',
  canceled: 'statusFailed',
};

/**
 * PayoutDashboardPage — shows the provider their real Stripe payout data:
 * available/pending balance, payout schedule, and past payouts with status
 * and arrival dates. Data comes from our own /api/payouts/* endpoints (the
 * connected accounts are Sharetribe-managed Custom accounts, so there is no
 * Stripe-hosted dashboard to link to). The client never sees the Stripe
 * secret key or even its own account ID as an input — the server resolves
 * everything from the session.
 */
export const PayoutDashboardPageComponent = (props) => {
  const { currentUser, scrollingDisabled } = props;
  const config = useConfiguration();
  const intl = useIntl();

  const [summary, setSummary] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [phase, setPhase] = useState('loading'); // loading | notConfigured | error | ready
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPayoutSummary(), getPayoutList({ limit: PAGE_SIZE })])
      .then(([s, l]) => {
        if (cancelled) return;
        setSummary(s);
        setPayouts(l?.payouts || []);
        setHasMore(!!l?.hasMore);
        setPhase('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setPhase(e?.error === 'payouts-not-configured' ? 'notConfigured' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(() => {
    const last = payouts[payouts.length - 1];
    if (!last) return;
    setLoadingMore(true);
    getPayoutList({ limit: PAGE_SIZE, startingAfter: last.id })
      .then((l) => {
        setPayouts((prev) => [...prev, ...(l?.payouts || [])]);
        setHasMore(!!l?.hasMore);
      })
      .finally(() => setLoadingMore(false));
  }, [payouts]);

  const user = ensureCurrentUser(currentUser);
  const userLoaded = !!user.id;
  // Payouts are provider-only; send everyone else to their profile settings.
  if (userLoaded && !showPaymentDetailsForUser(config, user)) {
    return <NamedRedirect name="ProfileSettingsPage" />;
  }

  const title = intl.formatMessage({ id: 'PayoutDashboardPage.title' });

  const noAccount = phase === 'ready' && summary && !summary.stripeAccount;
  const onboardingIncomplete =
    phase === 'ready' &&
    summary?.stripeAccount &&
    (summary.requirementsCurrentlyDue?.length > 0 || !summary.payoutsEnabled);

  const schedule = summary?.payoutSchedule;
  const scheduleLabel = schedule
    ? schedule.interval === 'daily'
      ? intl.formatMessage({ id: 'PayoutDashboardPage.scheduleDaily' })
      : schedule.interval === 'weekly'
        ? intl.formatMessage(
            { id: 'PayoutDashboardPage.scheduleWeekly' },
            { day: schedule.weekly_anchor || '' }
          )
        : schedule.interval === 'monthly'
          ? intl.formatMessage({ id: 'PayoutDashboardPage.scheduleMonthly' })
          : schedule.interval
    : null;

  const content =
    phase === 'loading' ? (
      <div className={css.spinnerWrap}>
        <IconSpinner />
      </div>
    ) : phase === 'notConfigured' ? (
      <p className={css.stateText}>
        <FormattedMessage id="PayoutDashboardPage.notConfigured" />
      </p>
    ) : phase === 'error' ? (
      <p className={css.errorText}>
        <FormattedMessage id="PayoutDashboardPage.loadFailed" />
      </p>
    ) : noAccount ? (
      <div className={css.stateBox}>
        <p className={css.stateText}>
          <FormattedMessage id="PayoutDashboardPage.noStripeAccount" />
        </p>
        <NamedLink name="StripePayoutPage" className={css.ctaLink}>
          <FormattedMessage id="PayoutDashboardPage.setUpPayouts" />
        </NamedLink>
      </div>
    ) : (
      <>
        {onboardingIncomplete ? (
          <div className={css.warningBox}>
            <p className={css.stateText}>
              <FormattedMessage id="PayoutDashboardPage.onboardingIncomplete" />
            </p>
            <NamedLink name="StripePayoutPage" className={css.ctaLink}>
              <FormattedMessage id="PayoutDashboardPage.finishOnboarding" />
            </NamedLink>
          </div>
        ) : null}

        <div className={css.balanceCards}>
          <div className={css.balanceCard}>
            <span className={css.balanceLabel}>
              <FormattedMessage id="PayoutDashboardPage.availableBalance" />
            </span>
            <span className={css.balanceAmount}>
              {formatMoney(summary.availableAmount, summary.currency)}
            </span>
          </div>
          <div className={css.balanceCard}>
            <span className={css.balanceLabel}>
              <FormattedMessage id="PayoutDashboardPage.pendingBalance" />
            </span>
            <span className={css.balanceAmount}>
              {formatMoney(summary.pendingAmount, summary.currency)}
            </span>
          </div>
          {scheduleLabel ? (
            <div className={css.balanceCard}>
              <span className={css.balanceLabel}>
                <FormattedMessage id="PayoutDashboardPage.payoutSchedule" />
              </span>
              <span className={css.scheduleValue}>{scheduleLabel}</span>
            </div>
          ) : null}
        </div>

        <H3 as="h2" className={css.sectionTitle}>
          <FormattedMessage id="PayoutDashboardPage.pastPayouts" />
        </H3>
        {payouts.length === 0 ? (
          <p className={css.stateText}>
            <FormattedMessage id="PayoutDashboardPage.noPayoutsYet" />
          </p>
        ) : (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>
                    <FormattedMessage id="PayoutDashboardPage.colAmount" />
                  </th>
                  <th>
                    <FormattedMessage id="PayoutDashboardPage.colStatus" />
                  </th>
                  <th>
                    <FormattedMessage id="PayoutDashboardPage.colArrival" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className={css.amountCell}>{formatMoney(p.amount, p.currency)}</td>
                    <td>
                      <span className={css[STATUS_CLASS[p.status] || 'statusInTransit']}>
                        {p.status === 'in_transit' ? 'in transit' : p.status}
                      </span>
                      {p.failureMessage ? (
                        <span className={css.failureNote}> {p.failureMessage}</span>
                      ) : null}
                    </td>
                    <td>{formatDate(p.arrivalDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore ? (
          <button
            type="button"
            className={css.loadMore}
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <IconSpinner />
            ) : (
              <FormattedMessage id="PayoutDashboardPage.loadMore" />
            )}
          </button>
        ) : null}
      </>
    );

  const accountSettingsNavProps = {
    currentPage: 'PayoutDashboardPage',
    showPaymentMethods: true,
    showPayoutDetails: true,
  };

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSideNavigation
        topbar={
          <>
            <TopbarContainer />
            <UserNav currentPage="PayoutDashboardPage" showManageListingsLink />
          </>
        }
        sideNav={null}
        useAccountSettingsNav
        currentPage="PayoutDashboardPage"
        accountSettingsNavProps={accountSettingsNavProps}
        footer={<FooterContainer />}
      >
        <div className={css.content}>
          <H3 as="h1">
            <FormattedMessage id="PayoutDashboardPage.heading" />
          </H3>
          {content}
        </div>
      </LayoutSideNavigation>
    </Page>
  );
};

const mapStateToProps = (state) => {
  const { currentUser } = state.user;
  return {
    currentUser,
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const PayoutDashboardPage = connect(mapStateToProps)(PayoutDashboardPageComponent);

export default PayoutDashboardPage;
