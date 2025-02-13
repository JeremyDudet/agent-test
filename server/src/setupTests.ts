import { beforeAll } from 'vitest'
import { config } from 'dotenv'

beforeAll(() => {
  // Load environment variables
  config()
  
  // Set default environment variables for testing
  process.env.OPENAI_API_KEY = 'test-key'
}) 