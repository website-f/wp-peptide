// Issues a new one-time administrator password:  docker compose exec panel npm run reset-password
import { randomPassword, setPassword } from './auth.js'

const pw = randomPassword()
await setPassword('admin', pw)
console.log(`New mail panel password for "admin": ${pw}`)
