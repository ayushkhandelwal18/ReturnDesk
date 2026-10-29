/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // The installed Tailwind loader supports Webpack's loader API too.
    // Group the preprocessor so Next keeps its built-in CSS handling intact.
    config.module.rules.push({
      rules: [
        {
          test: /\.css$/,
          exclude: /node_modules/,
          enforce: "pre",
          use: ["@tailwindcss/turbopack"],
        },
      ],
    });
    return config;
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
