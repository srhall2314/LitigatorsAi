import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  // Hash the password
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  })

  if (existingAdmin) {
    console.log('Admin user already exists:', adminEmail)
    // Update existing user to admin if not already, and update password
    const updateData: any = {}
    if (existingAdmin.role !== 'admin') {
      updateData.role = 'admin'
    }
    if (!existingAdmin.password) {
      updateData.password = hashedPassword
    }
    
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { email: adminEmail },
        data: updateData,
      })
      console.log('Updated admin user')
    }
    return
  }

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Admin User',
      role: 'admin',
      password: hashedPassword,
      emailVerified: new Date(),
    },
  })

  console.log('✅ Admin user created:', admin.email)
  console.log('📧 Email:', adminEmail)
  console.log('🔑 Password:', adminPassword)
  console.log('⚠️  Please change the default password after first login!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

