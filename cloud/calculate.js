const geoUtils = require('./geoUtils')
let proceso = {};
let datos;
module.exports = (parametros) => {
	datos = parametros;
	proceso = {
		success: false,
		pickups: {},
		dropoffs: {},
		options: [],
		start: datos.origen,
		end: datos.destino,
		area: datos.area
	};
	return new Promise((result, reject) => {
		const response = calcular();
		result(response);
	});
};
/**
    Message codes
    6. No near routes to the pickup area
	7. No near routes to the dropoff area
	8. No routes found
*/
const calcular = () => {
	datos.rutas.forEach(ruta => {
		enVia(datos.origen, ruta, "pickups");
		enVia(datos.destino, ruta, "dropoffs");
	});
	//validar si hay opciones
	const esOrigenes = Object.keys(proceso.pickups).length > 0;
	const esDestinos = Object.keys(proceso.dropoffs).length > 0;
	if (!esOrigenes || !esDestinos) {
		proceso.codeError = !esOrigenes ? 6 : 7;
		return proceso;
	}

	altiBajos(Object.keys(proceso.pickups), "pickups", datos.origen);
	altiBajos(Object.keys(proceso.dropoffs), "dropoffs", datos.destino);

	nivel1();
	if (verificarProceso()) return proceso;
	nivel2();
	if (verificarProceso()) return proceso;
	nivel3();
	if (verificarProceso()) return proceso;
	proceso.codeError = 8;
	return proceso;
}
/**EnVia

			___        _            _      
			| __|_ _   | |__ _  __ _(_)__ _ 
			| _|| ' \  | / _` | \ V / / _` |
			|___|_||_| |_\__,_|  \_/|_\__,_|


**/
const enVia = (ubicacion, ruta, tipo) => {
	if (geoUtils.isNearRoute(ruta, ubicacion, datos.config.walkInterval * proceso.area)) {
		proceso[tipo][ruta.id] = [];
	}
}
/**altiBajos

					_ _   _ _           _           
				   | | | (_) |         (_)          
			   __ _| | |_ _| |__   __ _ _  ___  ___ 
			  / _` | | __| | '_ \ / _` | |/ _ \/ __|
			 | (_| | | |_| | |_) | (_| | | (_) \__ \
			  \__,_|_|\__|_|_.__/ \__,_| |\___/|___/
									  _/ |          
									 |__/           

**/
const altiBajos = (idsRutas, tipo, punto) => {
	const maxDistance = datos.config.walkInterval * datos.area;
	const walkDistance = maxDistance + (maxDistance * datos.config.avgError);
	idsRutas.forEach((idRuta) => {
		let ruta = datos.rutas[datos.rutas.findIndex(x => x.id == idRuta)];
		let recorrido = ruta.path;
		let puntoAB = [];
		let puntoSw = true;
		let puntoAI = 0;//Anterior Index
		let puntoAD = undefined;//Anterior Distancia
		recorrido.forEach((puntoActual, index) => {
			if (!ruta.osisp || (ruta.osisp && puntoActual[2])) {
				if (!puntoAD) {
					puntoAD = geoUtils.distanceBetween(punto, puntoActual);
				} else {
					let puntoSD = geoUtils.distanceBetween(punto, puntoActual);//Siguiente Distancia
					if (puntoAD < puntoSD && puntoSw && puntoAD <= walkDistance) {
						puntoAB.push(puntoAI);
						puntoSw = false;
					} else if (puntoAD > puntoSD && !puntoSw) {
						puntoSw = true;
					} else if (puntoAD > puntoSD && index == recorrido.length - 1 &&
						puntoSD <= walkDistance) {
						puntoAB.push(index);
					}
					puntoAI = index;
					puntoAD = puntoSD;
				}
			}

		});
		if (puntoAB.length > 0) proceso[tipo][idRuta] = puntoAB;
	});
}
/**nivel1
					   _           _ __ 
		    	 	  (_)         | /_ |
				 _ __  ___   _____| || |
				| '_ \| \ \ / / _ \ || |
				| | | | |\ V /  __/ || |
				|_| |_|_| \_/ \___|_||_|
**/
const nivel1 = () => {
	Object.keys(proceso.pickups).forEach((idRuta) => {
		if (proceso.dropoffs[idRuta] && proceso.dropoffs[idRuta].length > 0
			&& proceso.pickups[idRuta].length > 0) {
			const respuesta = recorrer(
				proceso.pickups[idRuta],
				proceso.dropoffs[idRuta],
				datos.rutas[datos.rutas.findIndex(x => x.id == idRuta)],
				datos.origen,
				datos.destino
			);
			if (respuesta.length > 0) {
				proceso.options.push(formarOpcion([respuesta[0]]));
			}
		}
	});
}
/**nivel2
						   _           _ ___  
						  (_)         | |__ \ 
					_ __  ___   _____| |  ) |
					| '_ \| \ \ / / _ \ | / / 
					| | | | |\ V /  __/ |/ /_ 
					|_| |_|_| \_/ \___|_|____|
**/
const nivel2 = () => {
	Object.keys(proceso.pickups).forEach((idRO) => {
		Object.keys(proceso.dropoffs).forEach((idRD) => {
			if (idRO != idRD) {
				let iRO = datos.rutas.findIndex(x => x.id == idRO)
				let iRD = datos.rutas.findIndex(x => x.id == idRD)
				let cruzado = cruze(datos.rutas[iRO].path,
					datos.rutas[iRD].path,
					proceso.pickups[idRO][0],
					proceso.dropoffs[idRD][proceso.dropoffs[idRD].length - 1],
					datos.rutas[iRD].walkDistance);
				if (cruzado.fin.length > 0 && cruzado.ini.length > 0) {
					let opciones = recorrerCruze(
						cruzado,
						datos.origen,
						datos.destino,
						proceso.pickups[idRO],
						proceso.dropoffs[idRD],
						datos.rutas[iRO],
						datos.rutas[iRD]
					);

					if (opciones.length > 0) {
						sortPuntaje(opciones);
						proceso.options.push(opciones[0]);
					}
				}
			}
		});
	});
}
/**nivel3
				   _           _ ____
	     		  (_)         | |___ \ 
			 _ __  ___   _____| | __) |
			| '_ \| \ \ / / _ \ ||__ < 
			| | | | |\ V /  __/ |___) |
			|_| |_|_| \_/ \___|_|____/ 
**/
const nivel3 = () => {
	Object.keys(proceso.pickups).forEach(idRO => {
		datos.rutas.forEach(idR => {
			if (idRO !== idR.id) {
				let iRO = datos.rutas.findIndex(x => x.id == idRO)
				let cruzeInicial = cruze(
					datos.rutas[iRO].path,
					idR.path,
					proceso.pickups[idRO][0],
					idR.path.length - 1,
					idR.walkDistance);
				if (cruzeInicial.fin.length > 0 && cruzeInicial.ini.length > 0)
					Object.keys(proceso.dropoffs).forEach(idRD => {
						if (idRD !== idR.id && idRO !== idRD) {
							let iRD = datos.rutas.findIndex(x => x.id == idRD)
							//guardar el cruze
							let cruzeFinal = cruze(
								idR.path,
								datos.rutas[iRD].path,
								0,
								proceso.dropoffs[idRD][proceso.dropoffs[idRD].length - 1],
								datos.rutas[iRD].walkDistance);
							if (cruzeFinal.fin.length > 0 && cruzeFinal.ini.length > 0 &&
								validarCruzes(cruzeInicial, cruzeFinal)) {
								let opciones = [];
								for (let l = 0; l < cruzeInicial.fin.length && l < cruzeInicial.ini.length; l++) {
									let recorrido1 = recorrer(
										proceso.pickups[idRO],
										[cruzeInicial.fin[l]],
										datos.rutas[iRO],
										datos.origen, null);
									for (let m = 0; m < cruzeFinal.fin.length && m < cruzeFinal.ini.length; m++) {
										if (cruzeInicial.ini[l] < cruzeFinal.fin[m]) {

											recorrido2 = recorrer(
												[cruzeInicial.ini[l]],
												[cruzeFinal.fin[m]],
												idR,
												null, null);

											recorrido3 = recorrer(
												[cruzeFinal.ini[m]],
												proceso.dropoffs[idRD],
												datos.rutas[iRD],
												null, datos.destino);
											if(recorrido1.length>0 && recorrido2.length>0 && recorrido3.length>0)
												opciones.push(formarOpcion([recorrido1[0], recorrido2[0], recorrido3[0]]));
										}
									}
								}

								if (opciones.length > 0) {
									sortPuntaje(opciones);
									proceso.options.push(opciones[0]);
								}
							}
						}
					});
			}
		});
	});
}
/**recorrer
 * Calcula de una ruta entre varios puntos de inicio y varios puntos finales, el puntaje y la distancia de recorrido
 * Al final devuelve un arreglo con las opciones organizadas por puntaje
 * @param ini Los index donde inicia la ruta
 * @param fin Los index donde termina la ruta
 * @param ruta La Ruta
 * @param origen El Punto de origen
 * @param destino El Punto de destino
 * @returns {Array} Arreglo de objetos
 */
const recorrer = (ini, fin, ruta, origen, destino) => {
	let respuesta = [];
	for (let indexIni = 0; indexIni < ini.length; indexIni++) {
		for (let indexFin = 0; indexFin < fin.length; indexFin++) {
			if (ini[indexIni] < fin[indexFin]) {
				let R = ruta.path;
				let M = ruta.distances;
				let D = M[fin[indexFin]] - M[ini[indexIni]];
				respuesta.push({
					inicio: ini[indexIni],
					fin: fin[indexFin],
					routeDistanceValue: D,
					routeDistanceText: (D > 1000 ? (D / 1000).toFixed(1) + "km" : (D).toFixed(1) + "m"),
					score:
						(origen != null ? geoUtils.distanceBetween(origen, R[ini[indexIni]]) *
							datos.config.proportion : 0) +
						D +
						(destino != null ? geoUtils.distanceBetween(destino, R[fin[indexFin]]) *
							datos.config.proportion : 0)
				});
			}
		}
	}
	if (respuesta.length > 1) {
		sortPuntaje(respuesta);

	}
	if (respuesta.length > 0) {
		respuesta[0].route = JSON.parse(JSON.stringify(ruta));
	}
	return respuesta;
};
const sortPuntaje = (array) => {
	array.sort((a, b) => {
		if (a.score < b.score) {
			return -1;
		} else if (a.score > b.score) {
			return 1;
		} else {
			return 0;
		}
	});
};
/**formarOpcion
 * Crea el objeto opcion, sumando los puntajes de los recorridos .
 * @param rutas Los objetos de los recorridos con la ruta
 * @returns {{}|*} El objeto Opcion organizado
 */
const formarOpcion = (rutas) => {
	let opcion = { score: 0 };
	for (indexRutas = 0; indexRutas < rutas.length; indexRutas++) {
		opcion.score += rutas[indexRutas].score;
		rutas[indexRutas].startPoint = rutas[indexRutas].route.path[rutas[indexRutas].inicio];
		rutas[indexRutas].endPoint = rutas[indexRutas].route.path[rutas[indexRutas].fin];
	}
	opcion.routes = rutas;
	return opcion;
};
/**verificarProceso
	 _ __  _ __ ___   ___ ___  ___  __ _ _ __ 
	| '_ \| '__/ _ \ / __/ _ \/ __|/ _` | '__|
	| |_) | | | (_) | (_|  __/\__ \ (_| | |   
	| .__/|_|  \___/ \___\___||___/\__,_|_|   
	| |                                       
	|_|                                       
**/
const verificarProceso = () => {

	if (proceso.options.length > 0) {
		proceso.success = true;
		delete proceso.origenes;
		delete proceso.destinos;
		delete proceso.area;
		delete proceso.pickups;
		delete proceso.dropoffs;

		sortPuntaje(proceso.options);
		proceso.options.splice(datos.qty,
			Math.abs(proceso.options.length - datos.qty));
		proceso.options.forEach((opcion) => {
			let rutas = opcion.routes;

			opcion.startWalk = geoUtils.distanceBetween(datos.origen, rutas[0].startPoint);
			opcion.startWalkDistance = opcion.startWalk > 1000 ? (opcion.startWalk / 1000).toFixed(1) + "km" :
				(opcion.startWalk).toFixed(1) + "m";

			//-------------------
			opcion.endWalk = geoUtils.distanceBetween(datos.destino, rutas[rutas.length - 1].endPoint);
			opcion.endWalkDistances = opcion.end > 1000 ? (opcion.endWalk / 1000).toFixed(1) + "km" :
				(opcion.endWalk).toFixed(1) + "m";

			//-------------------
			let distancia = 0;
			rutas.forEach((ruta) => {
				distancia += ruta.routeDistanceValue;
				const path = ruta.route.path.splice(ruta.inicio, (ruta.fin - ruta.inicio + 1));
				ruta.route.polyline = geoUtils.encode(path);
				ruta.route.stops = [];
				if(ruta.route.osisp){
					path.forEach(location => {
						if(location[2]) ruta.route.stops.push(location);
					});
				}
				delete ruta.inicio;
				delete ruta.fin;
				delete ruta.route.path;
				delete ruta.route.distances;
				delete ruta.route.area;
				delete ruta.route.joins;
			});
			opcion.routeDistance = (distancia > 1000 ? (distancia / 1000).toFixed(1) + "km" : distancia.toFixed(1) + "m");
			distancia = (distancia / 1000) / 25;//velocidad
			opcion.time = (distancia > 1 ? distancia.toFixed(0) + "h" : (distancia * 60).toFixed(0) + "min");
		});
		return true;
	} else {
		return false;
	}
}
/**cruze
  ___ _ __ _   _ _______ 
 / __| '__| | | |_  / _ \
| (__| |  | |_| |/ /  __/
 \___|_|   \__,_/___\___|
 * Devuelve un objeto con 2 arreglos, los indexes de los finales de la ruta1 donde se cruza con la ruta2
 * y los indexes de los inicios de la ruta2 donde se cruza con la ruta1
 * @param ruta1 recorrido de la primera ruta
 * @param ruta2 recorrido de la segunda ruta
 * @param ini primer index de origenes de la ruta1
 * @param fin ultimo index de destinos de la ruta2
 * @returns {{fin: Array, ini: Array}}
 */
const cruze = (ruta1, ruta2, ini, fin, walkDistance) => {
	let m1 = { fin: [], ini: [] };
	for (let r1i = ini + 1; r1i < ruta1.length; r1i++) {
		for (let r2i = fin; r2i >= 0; r2i--) {
			let da = geoUtils.distanceBetween(ruta1[r1i], ruta2[r2i]);
			let ds;
			if (r2i - 1 >= 0) {
				ds = geoUtils.distanceBetween(ruta1[r1i], ruta2[r2i - 1]);
			}
			let wd = walkDistance? walkDistance : datos.config.walkingDistance
			if (da <= wd && (ds ? (da < ds) : true)) {
				//console.log("r1i",r1i,"r2i",r2i,"da",da,"ds",ds);
				m1.fin.push(r1i);
				m1.ini.push(r2i);
				break;
			}
		}
	}
	let m2 = { fin: [], ini: [] };
	let groups = [];
	if (m1.fin.length > 0) {
		let cg = [];
		const add2CG = (index, number) => {
			cg.push({
				ind: index,
				dist: geoUtils.distanceBetween(ruta1[m1.fin[index]], ruta2[m1.ini[index]]),
				num: number
			});
		}
		m1.fin.forEach((num, i) => {
			let isLast = i === m1.fin.length - 1;
			if (!isLast && m1.fin[i + 1] - num < 2) {
				add2CG(i, num);
			} else if ((!isLast && m1.fin[i + 1] - num > 1) || (isLast && i > 0)) {
				let isFromPrev = i > 0 && num - m1.fin[i - 1] < 2
				if (isFromPrev) {
					add2CG(i, num);
				}
				if (cg.length > 0) {
					groups.push(cg);
				}
				cg = [];
				if (!isFromPrev) {
					add2CG(i, num);
				}
			} else if (isLast && i === 0) {
				add2CG(i, num);
				groups.push(cg);
			}
		});
	}
	if (groups.length > 0) {
		groups.forEach(group => {
			group.sort((a, b) => {
				return a.dist - b.dist;
			});
			m2.fin.push(m1.fin[group[0].ind]);
			m2.ini.push(m1.ini[group[0].ind]);
		});
	}
	return m2;
};
/**recorrerCruze
*	Busca dentro de los cruzes, las mejores opciones
*/
const recorrerCruze = (cruzado, origen, destino, inicios, destinos, ruta1, ruta2) => {
	let opciones = [];
	for (let cruzeIndex = 0; cruzeIndex < cruzado.fin.length; cruzeIndex++) {
		let recorrido1 = recorrer(inicios, [cruzado.fin[cruzeIndex]], ruta1, origen, null);
		let recorrido2 = recorrer([cruzado.ini[cruzeIndex]], destinos, ruta2, null, destino);
		if (recorrido1.length > 0 && recorrido2.length > 0) {
			let opcion = formarOpcion([recorrido1[0], recorrido2[0]]);
			opciones.push(opcion);
		}

	}
	return opciones;
};
const validarCruzes = (cruze1, cruze2) => {
	for (cruze1Index = 0; cruze1Index < cruze1.ini.length; cruze1Index++) {
		for (cruze2Index = 0; cruze2Index < cruze2.fin.length; cruze2Index++) {
			if (cruze1.ini[cruze1Index] < cruze2.fin[cruze2Index]) {
				return true;
			}
		}
	}
	return false;
};