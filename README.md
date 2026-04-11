# Vite Sharetribe Web Template

[![Deploy to Production](https://github.com/journeyhorizon/sharetribe-web-template-vite/actions/workflows/production.yml/badge.svg)](https://github.com/journeyhorizon/sharetribe-web-template-vite/actions/workflows/production.yml)
[![Deploy to Staging](https://github.com/journeyhorizon/sharetribe-web-template-vite/actions/workflows/staging.yml/badge.svg)](https://github.com/journeyhorizon/sharetribe-web-template-vite/actions/workflows/staging.yml)

This is a template web application for Sharetribe marketplaces. You could create your own unique
marketplace web app by cloning this repository and then extending and customizing it to your needs.
This template is bootstrapped with Vite with some additions,
namely server side rendering, code-splitting, and a custom CSS setup.

This one is based on [Sharetribe web template](https://github.com/sharetribe/web-template)

> Read more from
> [Sharetribe Developer Docs](https://www.sharetribe.com/docs/template/sharetribe-web-template/)

## Quick start

### Setup localhost

If you just want to get the app running quickly to test it out, first install
[Bun.js](https://bun.sh/) and follow along:

```sh
git clone git@github.com:journeyhorizon/sharetribe-web-template-vite.git  # clone this repository
cd sharetribe-web-template-vite/                                      # change to the cloned directory
bun install                                          # install dependencies
bun run config                                       # add the mandatory env vars to your local config
bun run dev                                          # start the dev server, this will open a browser in localhost:3000
```

You can also follow along the
[Getting started with Sharetribe Web Template](https://www.sharetribe.com/docs/introduction/getting-started-with-web-template/)
tutorial in the [Sharetribe Developer Docs](https://www.sharetribe.com/docs/).

For more information of the configuration, see the
[Environment configuration variables](https://www.sharetribe.com/docs/template/template-env/)
reference in Sharetribe Developer Docs.

### For Windows users

We strongly recommend installing
[Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/about), if you are
developing on Windows. These templates are made for Unix-like web services which is the most common
environment type on host-services for web apps. Also, the Developer Docs use Unix-like commands in
articles instead of DOS commands.

## Getting started with your own customization

If you want to build your own Sharetribe marketplace by customizing the template application, see
the
[How to Customize the Template](https://www.sharetribe.com/docs/template/how-to-customize-template/)
guide in Developer Docs.

## Documentation

See the Sharetribe Developer Docs: [sharetribe.com/docs/](https://www.sharetribe.com/docs/)

## Get help – join Sharetribe Developer Slack channel

If you have any questions about development, the best place to ask them is the Developer Slack
channel at https://www.sharetribe.com/dev-slack

If you need help with development, you can hire a verified software developer with Sharetribe
experience from the [Expert Network](https://www.sharetribe.com/experts/).

## License

This project is licensed under the Journeyhorizon Vietnam Commercial License.
