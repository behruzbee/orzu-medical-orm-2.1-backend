import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { hashPin } from 'src/common/utils/pin.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
  ) {}

  async create(dto: CreateEmployeeDto) {
    const exist = await this.findOneByPhone(dto.phone);
    if (exist) {
      throw new ConflictException(
        'Bunday telefon raqamli xodim allaqachon mavjud',
      );
    }

    const employee = this.employeeRepository.create({
      ...dto,
      pin: dto.pin ? hashPin(dto.pin) : undefined,
    });
    return this.employeeRepository.save(employee);
  }

  async findAll() {
    return this.employeeRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const employee = await this.employeeRepository.findOne({ where: { id } });
    if (!employee) throw new NotFoundException('Xodim topilmadi');
    return employee;
  }

  async findOneByPhone(phone: string) {
    return this.employeeRepository.findOne({ where: { phone } });
  }

  async findForLogin(phone: string) {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .addSelect('employee.pin')
      .where('employee.phone = :phone', { phone })
      .getOne();
  }

  async findActiveById(id: string) {
    return this.employeeRepository.findOne({ where: { id, isActive: true } });
  }

  async replacePin(id: string, pin: string) {
    await this.employeeRepository
      .createQueryBuilder()
      .update(Employee)
      .set({ pin: hashPin(pin), tokenVersion: () => '"tokenVersion" + 1' })
      .where('id = :id', { id })
      .execute();
  }
}
