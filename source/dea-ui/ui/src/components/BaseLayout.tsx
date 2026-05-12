/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { BreadcrumbGroupProps } from '@cloudscape-design/components';
import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Head from 'next/head';
import * as React from 'react';
import packageJson from '../../package.json';
import { layoutLabels } from '../common/labels';
import Navigation from '../components/Navigation';
import { useSettings } from '../context/SettingsContext';
import { Notifications } from './common-components/Notifications';

export interface LayoutProps {
  navigationHide?: boolean;
  children: React.ReactNode;
  breadcrumbs: BreadcrumbGroupProps.Item[];
  activeHref?: string;
}

export default function BaseLayout(props: Readonly<LayoutProps>): React.ReactNode {
  const { navigationHide, children, breadcrumbs, activeHref = '#/' } = props;
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const { settings } = useSettings();
  return (
    <>
      <Head>
        <title>{settings.name}</title>
        <meta name="description" content={settings.description} />
        <meta name="version" content={packageJson.version} />
      </Head>
      <AppLayout
        headerSelector="[data-testid='header-top-navigation']"
        toolsHide
        ariaLabels={layoutLabels}
        navigationOpen={navigationOpen}
        navigationHide={navigationHide}
        navigation={<Navigation initialHref={activeHref} />}
        breadcrumbs={
          <BreadcrumbGroup items={breadcrumbs} expandAriaLabel="Show path" ariaLabel="Breadcrumbs" />
        }
        content={children}
        onNavigationChange={({ detail }) => {
          setNavigationOpen(detail.open);
        }}
        notifications={<Notifications />}
      />
    </>
  );
}
