import { MailService, PrismaService } from "@app/common"
import { ReservationCreateType, ReservationType } from "@app/common/schemas/reservation/types"
import { UserType } from "@app/common/schemas/user/types"
import { BadRequestException, HttpException, Injectable, NotFoundException } from "@nestjs/common"

@Injectable()
export class ReservationService {
  private readonly expiredTimeout = new Map<string, NodeJS.Timeout>()
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private async expireReservation(reservationId: string, sceanceId: string) {
    await this.prisma.reservation.update({
      where: { uid: reservationId },
      data: { status: "EXPIRED" },
    })
    this.expiredTimeout.delete(reservationId)
    await this.checkStatus(sceanceId)
  }
  private async checkStatus(sceanceId: string) {
    const sceance = await this.prisma.sceance.findFirst({
      where: { uid: sceanceId },
      include: { reservations: true },
    })
    // If there's an open reservation, we do nothing
    if (sceance?.reservations.find(r => r.status === "OPEN")) return

    // If there's a pending reservation, we open it
    const pending = sceance?.reservations.find(r => r.status === "PENDING")
    if (pending) {
      await this.prisma.reservation.update({
        where: { uid: pending.uid },
        data: { status: "OPEN", expiresAt: new Date(Date.now() + 1 * 1000 * 60) },
      })
      this.expiredTimeout.set(
        pending.uid,
        setTimeout(() => this.expireReservation(pending.uid, sceanceId), 1 * 1000 * 60),
      )
      return
    }
  }
  private async formatReservation(reservationId: string): Promise<ReservationType> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { uid: reservationId },
      include: { sceance: { include: { reservations: true } } },
    })
    if (!reservation) throw new NotFoundException("Reservation not found")

    return {
      uid: reservation.uid,
      sceanceUid: reservation.sceanceUid,
      status: reservation.status,
      seats: reservation.nbSeats,
      rank:
        reservation.sceance.reservations
          .filter(r => r.status === "PENDING")
          .findIndex(r => r.uid === reservation.uid) + 1,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
      expiresAt: reservation.expiresAt,
    }
  }

  async makeReservation(movieId: string, userId: string, data: ReservationCreateType) {
    const sceance = await this.prisma.sceance.findFirst({
      where: { movieUid: movieId, uid: data.sceance },
      include: { room: true, reservations: true },
    })
    if (!sceance) return { type: "error", message: "Sceance not found" }

    const seatsReserved = sceance.reservations
      .filter(r => r.status !== "EXPIRED")
      .reduce((acc, r) => acc + r.nbSeats, 0)
    if (seatsReserved + data.nbSeats > sceance.room.seats)
      return { type: "error", message: "Not enough seats, check late." }

    const reservationId = await this.prisma.reservation
      .create({
        data: {
          status: "PENDING",
          nbSeats: data.nbSeats,
          user: { connect: { uid: userId } },
          sceance: { connect: { uid: sceance.uid } },
        },
      })
      .then(r => r.uid)
    await this.checkStatus(sceance.uid)

    const reservation = await this.formatReservation(reservationId)
    return { type: "success", data: reservation }
  }
  async confirmReservation(reservationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { uid: userId } })
    const reservation = await this.prisma.reservation.findFirst({
      where: { uid: reservationId, userUid: userId },
      include: { sceance: { include: { movie: true } } },
    })
    if (!user) throw new NotFoundException("User not found")
    if (!reservation) throw new NotFoundException("Reservation not found")
    if (reservation.status === "CONFIRMED")
      throw new BadRequestException("Reservation already confirmed")
    else if (reservation.status === "EXPIRED") throw new HttpException("Reservation expired", 410)
    else if (reservation.status === "PENDING") throw new BadRequestException("Reservation not open")

    // If the server is restarted, we need to check if the reservation is expired
    if (reservation.expiresAt && reservation.expiresAt < new Date()) {
      await this.expireReservation(reservationId, reservation.sceanceUid)
      throw new HttpException("Reservation expired", 410)
    }

    await this.prisma.reservation.update({
      where: { uid: reservationId },
      data: { status: "CONFIRMED", expiresAt: null },
    })
    clearTimeout(this.expiredTimeout.get(reservationId))
    this.expiredTimeout.delete(reservationId)

    await this.checkStatus(reservation.sceanceUid)

    await this.mailService.sendEmail(
      user.email,
      "Reservation confirmed",
      `
<h1>Reservation confirmed</h1>
<p>Your reservation for <b>${reservation.sceance.movie.name}</b> has been confirmed.</p>
<p>Seats: <b>${reservation.nbSeats}</b></p>
<p>Date: <b>${reservation.sceance.date.toISOString()}</b></p>
<p>Thank you for using our service.</p>`,
    )
    return this.formatReservation(reservationId)
  }
  async getReservation(reservationId: string, user: UserType) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { uid: reservationId },
    })
    if (!reservation || (user.role !== "ADMIN" && reservation.userUid !== user.uid))
      throw new NotFoundException("Reservation not found")

    return this.formatReservation(reservationId)
  }

  async getReservationsByMovie(movieId: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { uid: movieId },
      include: { sceances: true },
    })
    if (!movie) throw new NotFoundException("Movie not found")
    return Promise.all(
      movie.sceances.map(async sceance => this.getReservationsBySceance(movieId, sceance.uid)),
    ).then(reservations => reservations.flat())
  }
  async getReservationsBySceance(movieId: string, sceanceId: string): Promise<ReservationType[]> {
    const sceance = await this.prisma.sceance.findFirst({
      where: { uid: sceanceId, movieUid: movieId },
      include: { reservations: true },
    })
    if (!sceance) throw new NotFoundException("Sceance not found")

    return sceance.reservations.map(r => ({
      uid: r.uid,
      sceanceUid: r.sceanceUid,
      status: r.status,
      seats: r.nbSeats,
      rank:
        sceance.reservations.filter(r => r.status === "PENDING").findIndex(r => r.uid === r.uid) +
        1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      expiresAt: r.expiresAt,
    }))
  }
}
