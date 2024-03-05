import { CommonModule } from "@app/common"
import { RmqModule } from "@app/common/rmq/rmq.module"
import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import * as joi from "joi"

import { ReservationController } from "./reservation.controller"
import { ReservationService } from "./reservation.service"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: joi.object({
        DATABASE_URL: joi.string().required(),
        RABBIT_MQ_URL: joi.string().required(),
      }),
      envFilePath: "./apps/reservation/.env",
    }),
    RmqModule,
    CommonModule,
  ],
  controllers: [ReservationController],
  providers: [ReservationService],
})
export class ReservationModule {}
