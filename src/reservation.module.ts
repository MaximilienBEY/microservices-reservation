import { CommonModule } from "@app/common"
import { RmqModule } from "@app/common/rmq/rmq.module"
import { Module } from "@nestjs/common"

import { ReservationController } from "./reservation.controller"
import { ReservationService } from "./reservation.service"

@Module({
  imports: [RmqModule, CommonModule],
  controllers: [ReservationController],
  providers: [ReservationService],
})
export class ReservationModule {}
