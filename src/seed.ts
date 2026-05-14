import { INestApplicationContext, Logger } from '@nestjs/common';
import { PatientsService } from './modules/patients/services/patients.service';
import { UsersService } from './modules/users/users.service'; // Путь может отличаться
// import { PatientStatus } from './common/enums/patient-status.enum';

export async function runSeed(app: INestApplicationContext) {
  const logger = new Logger('SeedData');
  
  // Сервисы
  const patientsService = app.get(PatientsService);
  const usersService = app.get(UsersService);

  // 1. Сидируем Администратора
  const adminData = {
    name: 'Super Admin',
    phone: '+998978784727', // Укажи нужный номер
    pin: '12345',            // Пин-код для входа
    role: 'admin',          // Роль
    isActive: true,
  };

  try {
    const existingAdmin = await usersService.findOneByPhone(adminData.phone);
    if (!existingAdmin) {
      await usersService.create(adminData as any);
      logger.log(`Admin ${adminData.name} created successfully.`);
    } else {
      logger.log(`Admin ${adminData.phone} already exists, skipping.`);
    }
  } catch (error) {
    logger.error(`Error seeding admin: ${error.message}`);
  }

  // 2. Сидируем Пациентов
  // const initialPatients = [
  //   {
  //     name: 'Baxtiyor',
  //     phone: '+998975448554',
  //     branch: 'Zangiota',
  //     departureDate: '2025-12-25T00:00:00.000Z',
  //     arrivalDate: '2025-12-20T00:00:00.000Z',
  //     status: PatientStatus.NEW,
  //     avatarColor: '#2196F3',
  //   },
  // ];

  // for (const patientDto of initialPatients) {
  //   try {
  //     await patientsService.createFromExternal(patientDto as any);
  //     logger.log(`Patient ${patientDto.name} seeded successfully.`);
  //   } catch (error) {
  //     if (error.status === 409) {
  //       continue;
  //     }
  //     logger.error(`Error seeding patient ${patientDto.name}: ${error.message}`);
  //   }
  // }
}