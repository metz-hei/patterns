import React from 'react';
import Layout from '@theme-original/Layout';
import FeedbackButton from '@site/src/components/FeedbackButton';
import LogoutButton from '@site/src/components/LogoutButton';

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <LogoutButton />
      <FeedbackButton />
    </>
  );
} 