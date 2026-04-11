import React from 'react';

const StarRating = ({ rating, size = 'sm' }) => {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sizeClass} ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

const ReviewCard = ({ review, design = 'clean' }) => {
  const { rating, content, authorName, createdAt } = review;

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  const designStyles = {
    clean: {
      card: 'bg-white rounded-xl border border-gray-200 p-5',
      author: 'font-semibold text-gray-900 text-sm',
      date: 'text-gray-400 text-xs',
      content: 'text-gray-600 text-sm mt-3 leading-relaxed',
    },
    resort: {
      card: 'bg-white rounded-2xl border border-emerald-100 p-5 shadow-sm',
      author: 'font-semibold text-emerald-900 text-sm',
      date: 'text-emerald-400 text-xs',
      content: 'text-emerald-700 text-sm mt-3 leading-relaxed',
    },
    luxury: {
      card: 'bg-gray-900/50 rounded-xl border border-gray-700 p-5',
      author: 'font-semibold text-white text-sm',
      date: 'text-gray-500 text-xs',
      content: 'text-gray-400 text-sm mt-3 leading-relaxed font-light',
    },
    party: {
      card: 'bg-slate-800 rounded-2xl border border-slate-600 p-5',
      author: 'font-bold text-white text-sm',
      date: 'text-slate-400 text-xs',
      content: 'text-slate-300 text-sm mt-3 leading-relaxed',
    },
    family: {
      card: 'bg-white rounded-2xl border border-amber-200 p-5 shadow-sm',
      author: 'font-bold text-amber-900 text-sm',
      date: 'text-amber-400 text-xs',
      content: 'text-amber-700 text-sm mt-3 leading-relaxed',
    },
    bold: {
      card: 'bg-stone-800 rounded-xl border border-stone-600 p-5',
      author: 'font-bold text-white text-sm font-mono',
      date: 'text-stone-500 text-xs font-mono',
      content: 'text-stone-300 text-sm mt-3 leading-relaxed',
    },
  };

  const styles = designStyles[design] || designStyles.clean;

  return (
    <div className={styles.card}>
      <div className="flex items-center justify-between">
        <div>
          <p className={styles.author}>{authorName}</p>
          <p className={styles.date}>{formatDate(createdAt)}</p>
        </div>
        <StarRating rating={rating} />
      </div>
      {content && <p className={styles.content}>{content}</p>}
    </div>
  );
};

const ReviewSection = ({ reviews = [], design = 'clean', className = '' }) => {
  if (!reviews.length) return null;

  const avgRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;

  const headingStyles = {
    clean: 'text-xl font-bold text-gray-900',
    resort: 'text-xl font-bold text-emerald-900',
    luxury: 'text-xl font-light text-white tracking-wider uppercase',
    party: 'text-xl font-bold text-white',
    family: 'text-xl font-bold text-amber-900',
    bold: 'text-xl font-bold text-white font-mono',
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-6">
        <h2 className={headingStyles[design] || headingStyles.clean}>Reviews</h2>
        <div className="flex items-center gap-2">
          <StarRating rating={Math.round(avgRating)} />
          <span className="text-sm text-gray-500">
            {avgRating.toFixed(1)} ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {reviews.map((review, idx) => (
          <ReviewCard key={idx} review={review} design={design} />
        ))}
      </div>
    </div>
  );
};

export default ReviewSection;
