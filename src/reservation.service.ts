import { PrismaService } from "@app/common"
import { Injectable } from "@nestjs/common"

@Injectable()
export class ReservationService {
  constructor(private readonly prisma: PrismaService) {}
}
