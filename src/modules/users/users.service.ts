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

    const employee = this.employeeRepository.create(dto);
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
}
