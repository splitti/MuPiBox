const environment = {
  test: process.env.NODE_ENV === 'test',
  development: process.env.NODE_ENV === 'development',
  production: !(process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'),
}

module.exports = { environment }
