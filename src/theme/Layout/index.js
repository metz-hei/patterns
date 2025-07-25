import React from 'react';
import Layout from '@theme-original/Layout';
import FeedbackButton from '@site/src/components/FeedbackButton';

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <FeedbackButton />
    </>
  );
} 