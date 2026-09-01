// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Главинтерфейс',
  tagline: 'Что это такое? И зачем все это нужно? ',
  url: 'https://zdesbildizain.ru',
  baseUrl: '/',
  favicon: 'img/favicon.ico',
  noIndex: true,
  organizationName: '',
  projectName: 'Главинтерфейс',
  i18n: {
    defaultLocale: 'ru',
    locales: ['ru'],
  },

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
    },
  },

  clientModules: ['./src/clientModules/authGate.js'],
  scripts: [
    {
      src: '/js/auth.js',
      defer: true,
    },
  ],


  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          remarkPlugins: [
            [require('@mavrin/remark-typograf'), {
              locale: ['ru'],
            }],
          ],
        },
        pages: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],
  plugins: [
    './src/plugins/localAuthApi.js',
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
    [
      '@docusaurus/plugin-content-pages',
      {
        remarkPlugins: [
          [require('@mavrin/remark-typograf'), {
            locale: ['ru'],
          }],
        ],
      },
    ],
    ['docusaurus-plugin-yandex-metrica', {
      counterID: '102592839',
    }],
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Главинтерфейс',
        logo: {
          alt: 'Главинтерфейс',
          src: 'img/logo2.svg',
        },
        items: [
          {collapsible: false, to: '/patterns', label: 'Паттерны', position: 'left'},
          {collapsible: false, to: '/components', label: 'Компоненты', position: 'left'},
          {collapsible: false, to: '/rdpk', label: 'Редполитика', position: 'left'},
          {collapsible: false, to: '/resources', label: 'Ресурсы', position: 'left'},
          {collapsible: false, to: '/about/feature-requests', label: 'О проекте', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        copyright: `© 2025` ,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
