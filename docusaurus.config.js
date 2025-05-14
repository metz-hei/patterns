// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Гайды',
  tagline: 'Что это такое? И зачем все это нужно? ',
  url: 'https://onemilliondollarsdesigndocumentation.ru/',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  noIndex: true,
  organizationName: '',
  projectName: 'Гайды',
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl:
            'https://github.com/metz-hei/patterns',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-content-blog',
      {
        id: 'changelog',
        routeBasePath: 'changelog',
        path: './changelog',
        blogTitle: 'Что нового',
        blogSidebarTitle: 'Что нового',
        onUntruncatedBlogPosts: 'ignore'
      },
    ],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Гайды',
        logo: {
          alt: 'Гайды',
          src: 'img/logo2.svg',
        },
        items: [
          {collapsible: false, to: '/patterns', label: 'Паттерны', position: 'left'},
          {collapsible: false, to: '/components', label: 'Компоненты', position: 'left'},
          {collapsible: false, to: '/rdpk', label: 'Редполитика', position: 'left'},
          {collapsible: false, to: '/about/feature-requests', label: 'О проекте', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        copyright: `© 2024`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
